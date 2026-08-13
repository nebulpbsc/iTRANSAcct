"""
Auto-posting engine.

This module is the entire accounting brain of the app. There is NO manual
journal entry screen anywhere in the product — every journal line that ever
gets created originates from exactly one of the two functions below, fired
by the transaction state machine (SEND or TAKE). This is what guarantees
"single data entry, dual bookkeeping": the human only ever fills in an
invoice or payment form once; both companies' books are derived from it.

Account model per company (auto-provisioned):
  - "Sales Account"        (INCOME)   - system account
  - "Purchase Account"     (EXPENSE)  - system account
  - "Cash Account"         (ASSET)    - default cash/bank, system account
  - one PARTY_RECEIVABLE or PARTY_PAYABLE account per counterparty, created
    lazily the first time it's needed (named after the counterparty).

Postings
--------
SALE_PURCHASE, on SEND (sender = seller):
    Dr  Party Receivable (counterparty)      total_amount
        Cr  Sales Account                        total_amount

SALE_PURCHASE, on TAKE (recipient = buyer):
    Dr  Purchase Account                     total_amount
        Cr  Party Payable (sender)               total_amount

PAYMENT_RECEIPT, on SEND (sender = payer):
    Dr  Party Payable (counterparty)         amount   [reduces what sender owes them]
        Cr  Cash/Bank Account                    amount

PAYMENT_RECEIPT, on TAKE (recipient = payee):
    Dr  Cash/Bank Account                    amount
        Cr  Party Receivable (sender)            amount   [reduces what they owe recipient]

Because both sides post the same amount, in opposite party-account
directions, the Reconciliation report between any two companies always
nets to zero once both legs are TAKEN — with zero manual matching.
"""
from datetime import date
from sqlalchemy.orm import Session

from . import models


SALES_ACCOUNT = "Sales Account"
PURCHASE_ACCOUNT = "Purchase Account"
CASH_ACCOUNT = "Cash Account"


def ensure_system_accounts(db: Session, company: models.Company):
    """Create the fixed system accounts for a newly-registered company."""
    defaults = [
        (SALES_ACCOUNT, models.AccountGroup.INCOME),
        (PURCHASE_ACCOUNT, models.AccountGroup.EXPENSE),
        (CASH_ACCOUNT, models.AccountGroup.ASSET),
    ]
    for name, group in defaults:
        existing = (
            db.query(models.Account)
            .filter(models.Account.company_id == company.id, models.Account.name == name)
            .first()
        )
        if not existing:
            db.add(models.Account(
                company_id=company.id, name=name, group=group,
                type=models.AccountType.STANDARD, is_system=True,
            ))
    db.commit()


def get_or_create_party_account(
    db: Session, company_id: str, counterparty_id: str, counterparty_name: str,
    as_type: models.AccountType,
) -> models.Account:
    """Every company has, at most, ONE receivable-side and ONE payable-side
    ledger per counterparty (mirrors Tally's single party ledger convention:
    in practice a party is usually either a debtor or a creditor at a time,
    but we track both directions separately for clean audit trails)."""
    acct = (
        db.query(models.Account)
        .filter(
            models.Account.company_id == company_id,
            models.Account.counterparty_company_id == counterparty_id,
            models.Account.type == as_type,
        )
        .first()
    )
    if acct:
        return acct

    suffix = "(Receivable)" if as_type == models.AccountType.PARTY_RECEIVABLE else "(Payable)"
    group = models.AccountGroup.ASSET if as_type == models.AccountType.PARTY_RECEIVABLE else models.AccountGroup.LIABILITY
    acct = models.Account(
        company_id=company_id,
        name=f"{counterparty_name} {suffix}",
        group=group,
        type=as_type,
        counterparty_company_id=counterparty_id,
    )
    db.add(acct)
    db.flush()
    return acct


def _next_voucher_no(db: Session, company_id: str, voucher_type: str) -> str:
    count = (
        db.query(models.JournalEntry)
        .filter(models.JournalEntry.company_id == company_id, models.JournalEntry.voucher_type == voucher_type)
        .count()
    )
    prefix = {"Sales": "SV", "Purchase": "PV", "Payment": "PMT", "Receipt": "RCT"}.get(voucher_type, "JV")
    return f"{prefix}-{count + 1:05d}"


def _make_entry(db: Session, company_id, transaction_id, voucher_type, voucher_no, entry_date, narration, lines):
    """lines: list of (account_id, debit, credit)"""
    entry = models.JournalEntry(
        company_id=company_id,
        transaction_id=transaction_id,
        voucher_type=voucher_type,
        voucher_no=voucher_no,
        entry_date=entry_date,
        narration=narration,
    )
    db.add(entry)
    db.flush()
    total_dr = round(sum(l[1] for l in lines), 2)
    total_cr = round(sum(l[2] for l in lines), 2)
    if total_dr != total_cr:
        raise ValueError(f"Unbalanced journal entry: Dr {total_dr} != Cr {total_cr}")
    for account_id, debit, credit in lines:
        db.add(models.JournalLine(entry_id=entry.id, account_id=account_id, debit=debit, credit=credit))
    db.flush()
    return entry


def post_on_send(db: Session, txn: models.Transaction, sender_sales_account_id: str = None) -> models.JournalEntry:
    """Auto-post to the SENDER's books the moment they hit 'Send'."""
    sender = txn.sender_company
    recipient = txn.recipient_company
    ensure_system_accounts(db, sender)

    def resolve_account_for_head(company_id: str, head_name: str, fallback_name: str):
        # Try to resolve via AccountHead mapping; fallback to system account by name
        head = db.query(models.AccountHead).filter_by(name=head_name).first()
        if head:
            mapping = db.query(models.AccountHeadMapping).filter_by(company_id=company_id, head_id=head.id).first()
            if mapping:
                acct = db.query(models.Account).filter_by(id=mapping.account_id).first()
                if acct:
                    return acct
        return db.query(models.Account).filter_by(company_id=company_id, name=fallback_name).first()

    if txn.type == models.TransactionType.SALE_PURCHASE:
        if sender_sales_account_id:
            sales_acct = db.query(models.Account).filter_by(id=sender_sales_account_id, company_id=sender.id).first()
        else:
            sales_acct = resolve_account_for_head(sender.id, "Sales", SALES_ACCOUNT)
        party_recv = get_or_create_party_account(
            db, sender.id, recipient.id, recipient.name, models.AccountType.PARTY_RECEIVABLE
        )
        voucher_no = _next_voucher_no(db, sender.id, "Sales")
        entry = _make_entry(
            db, sender.id, txn.id, "Sales", voucher_no, txn.txn_date,
            f"Sale to {recipient.name} — {txn.narration or ''}".strip(" —"),
            [(party_recv.id, txn.total_amount, 0.0), (sales_acct.id, 0.0, txn.total_amount)],
        )

    else:  # PAYMENT_RECEIPT
        cash_acct_id = txn.sender_cash_account_id
        if not cash_acct_id:
            cash_acct = resolve_account_for_head(sender.id, "Cash", CASH_ACCOUNT)
            cash_acct_id = cash_acct.id
        party_pay = get_or_create_party_account(
            db, sender.id, recipient.id, recipient.name, models.AccountType.PARTY_PAYABLE
        )
        voucher_no = _next_voucher_no(db, sender.id, "Payment")
        entry = _make_entry(
            db, sender.id, txn.id, "Payment", voucher_no, txn.txn_date,
            f"Payment to {recipient.name} — {txn.narration or ''}".strip(" —"),
            [(party_pay.id, txn.total_amount, 0.0), (cash_acct_id, 0.0, txn.total_amount)],
        )

    txn.voucher_no = voucher_no
    return entry


def post_on_take(db: Session, txn: models.Transaction, recipient_cash_account_id: str = None, recipient_purchase_account_id: str = None) -> models.JournalEntry:
    """Auto-post the MIRRORED entry to the RECIPIENT's books on acknowledgment.
    This is the zero-data-entry step: the recipient supplies no new facts
    (except, for payments, which of their own bank accounts received it)."""
    sender = txn.sender_company
    recipient = txn.recipient_company
    ensure_system_accounts(db, recipient)

    if txn.type == models.TransactionType.SALE_PURCHASE:
        # Prefer an explicit purchase account supplied by the taker; otherwise fall back to system Purchase account
        purchase_acct = None
        if recipient_purchase_account_id:
            purchase_acct = db.query(models.Account).filter_by(id=recipient_purchase_account_id, company_id=recipient.id).first()
        if not purchase_acct:
            purchase_acct = db.query(models.Account).filter_by(company_id=recipient.id, name=PURCHASE_ACCOUNT).first()
        party_pay = get_or_create_party_account(
            db, recipient.id, sender.id, sender.name, models.AccountType.PARTY_PAYABLE
        )
        voucher_no = _next_voucher_no(db, recipient.id, "Purchase")
        entry = _make_entry(
            db, recipient.id, txn.id, "Purchase", voucher_no, txn.txn_date,
            f"Purchase from {sender.name} — {txn.narration or ''}".strip(" —"),
            [(purchase_acct.id, txn.total_amount, 0.0), (party_pay.id, 0.0, txn.total_amount)],
        )

    else:  # PAYMENT_RECEIPT -> recorded as Receipt
        cash_acct_id = recipient_cash_account_id
        if not cash_acct_id:
            cash_acct = resolve_account_for_head(recipient.id, "Cash", CASH_ACCOUNT)
            cash_acct_id = cash_acct.id
        party_recv = get_or_create_party_account(
            db, recipient.id, sender.id, sender.name, models.AccountType.PARTY_RECEIVABLE
        )
        voucher_no = _next_voucher_no(db, recipient.id, "Receipt")
        entry = _make_entry(
            db, recipient.id, txn.id, "Receipt", voucher_no, txn.txn_date,
            f"Receipt from {sender.name} — {txn.narration or ''}".strip(" —"),
            [(cash_acct_id, txn.total_amount, 0.0), (party_recv.id, 0.0, txn.total_amount)],
        )

    return entry
