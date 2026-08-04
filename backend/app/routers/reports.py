from datetime import date
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from .. import models, schemas, security
from ..database import get_db

router = APIRouter(prefix="/reports", tags=["reports"])


def _debit_balance_groups():
    # Assets & Expenses normally carry debit balances
    return {models.AccountGroup.ASSET, models.AccountGroup.EXPENSE}


# ---------------------------------------------------------------------------
# Ledger — every journal line for one account, with running balance
# ---------------------------------------------------------------------------
@router.get("/ledger/{account_id}", response_model=schemas.LedgerReportOut)
def ledger(
    account_id: str,
    from_date: Optional[date] = None,
    to_date: Optional[date] = None,
    db: Session = Depends(get_db),
    current: models.Company = Depends(security.get_current_company),
):
    account = db.query(models.Account).filter(models.Account.id == account_id).first()
    if not account or account.company_id != current.id:
        raise HTTPException(status_code=404, detail="Account not found")

    q = (
        db.query(models.JournalLine, models.JournalEntry)
        .join(models.JournalEntry, models.JournalLine.entry_id == models.JournalEntry.id)
        .filter(models.JournalLine.account_id == account_id)
        .order_by(models.JournalEntry.entry_date, models.JournalEntry.created_at)
    )
    all_rows = q.all()

    is_debit_normal = account.group in _debit_balance_groups()

    # Pass 1: sum everything strictly before from_date into the opening balance.
    opening = 0.0
    if from_date:
        for jl, je in all_rows:
            if je.entry_date < from_date:
                opening += (jl.debit - jl.credit) if is_debit_normal else (jl.credit - jl.debit)

    # Pass 2: build the ledger lines within [from_date, to_date] with a running balance.
    running = opening
    lines = []
    for jl, je in all_rows:
        if from_date and je.entry_date < from_date:
            continue
        if to_date and je.entry_date > to_date:
            continue
        delta = (jl.debit - jl.credit) if is_debit_normal else (jl.credit - jl.debit)
        running += delta
        lines.append(schemas.LedgerLineOut(
            date=je.entry_date, voucher_type=je.voucher_type, voucher_no=je.voucher_no,
            narration=je.narration, debit=jl.debit, credit=jl.credit, balance=round(running, 2),
        ))

    return schemas.LedgerReportOut(
        account_id=account.id, account_name=account.name,
        opening_balance=round(opening, 2), closing_balance=round(running, 2), lines=lines,
    )


# ---------------------------------------------------------------------------
# Trial Balance — every account, net debit or credit, as of a date
# ---------------------------------------------------------------------------
@router.get("/trial-balance", response_model=schemas.TrialBalanceOut)
def trial_balance(
    as_of: Optional[date] = None,
    db: Session = Depends(get_db),
    current: models.Company = Depends(security.get_current_company),
):
    as_of = as_of or date.today()
    accounts = db.query(models.Account).filter(models.Account.company_id == current.id).all()

    rows = []
    total_debit = 0.0
    total_credit = 0.0
    for acct in accounts:
        q = (
            db.query(models.JournalLine)
            .join(models.JournalEntry, models.JournalLine.entry_id == models.JournalEntry.id)
            .filter(models.JournalLine.account_id == acct.id, models.JournalEntry.entry_date <= as_of)
        )
        debit_sum = sum(l.debit for l in q) or 0.0
        credit_sum = sum(l.credit for l in q) or 0.0
        net = round(debit_sum - credit_sum, 2)
        if net == 0:
            continue
        if net > 0:
            rows.append(schemas.TrialBalanceRow(account_id=acct.id, account_name=acct.name, group=acct.group.value, debit=net, credit=0.0))
            total_debit += net
        else:
            rows.append(schemas.TrialBalanceRow(account_id=acct.id, account_name=acct.name, group=acct.group.value, debit=0.0, credit=-net))
            total_credit += -net

    rows.sort(key=lambda r: (r.group, r.account_name))
    return schemas.TrialBalanceOut(
        as_of=as_of, rows=rows, total_debit=round(total_debit, 2), total_credit=round(total_credit, 2)
    )


# ---------------------------------------------------------------------------
# Reconciliation — compare "our books" vs "their books" for one counterparty
# ---------------------------------------------------------------------------
@router.get("/reconciliation/{counterparty_id}", response_model=schemas.ReconciliationOut)
def reconciliation(
    counterparty_id: str,
    db: Session = Depends(get_db),
    current: models.Company = Depends(security.get_current_company),
):
    counterparty = db.query(models.Company).filter(models.Company.id == counterparty_id).first()
    if not counterparty:
        raise HTTPException(status_code=404, detail="Company not found")

    txns = (
        db.query(models.Transaction)
        .filter(
            ((models.Transaction.sender_company_id == current.id) & (models.Transaction.recipient_company_id == counterparty_id))
            | ((models.Transaction.sender_company_id == counterparty_id) & (models.Transaction.recipient_company_id == current.id))
        )
        .filter(models.Transaction.state != models.TransactionState.DRAFT)
        .order_by(models.Transaction.txn_date)
        .all()
    )

    rows = []
    our_balance = 0.0  # positive = counterparty owes us; negative = we owe counterparty
    for t in txns:
        i_am_sender = t.sender_company_id == current.id
        if t.type == models.TransactionType.SALE_PURCHASE:
            # if I sent it -> I'm the seller -> they owe me (+). If I received it -> I owe them (-)
            sign = 1 if i_am_sender else -1
        else:  # PAYMENT_RECEIPT
            # if I sent payment -> reduces what I owe them, i.e. moves balance toward + (I owe less)
            sign = 1 if i_am_sender else -1

        my_amt = t.total_amount if t.state in (models.TransactionState.SENT, models.TransactionState.TAKEN) and i_am_sender else 0.0
        their_amt = t.total_amount if t.state == models.TransactionState.TAKEN and not i_am_sender else 0.0
        # "amount as per our books" = only counted once WE have posted (i.e. we are sender & SENT/TAKEN,
        #  or we are recipient & TAKEN it ourselves)
        amount_our_books = t.total_amount if (
            (i_am_sender and t.state in (models.TransactionState.SENT, models.TransactionState.TAKEN))
            or (not i_am_sender and t.state == models.TransactionState.TAKEN)
        ) else 0.0
        amount_their_books = t.total_amount if (
            (not i_am_sender and t.state in (models.TransactionState.SENT, models.TransactionState.TAKEN))
            or (i_am_sender and t.state == models.TransactionState.TAKEN)
        ) else 0.0

        matched = t.state == models.TransactionState.TAKEN

        if amount_our_books:
            our_balance += sign * amount_our_books

        rows.append(schemas.ReconciliationRow(
            transaction_id=t.id, txn_date=t.txn_date, voucher_no=t.voucher_no,
            type=t.type.value, state=t.state.value,
            amount_our_books=amount_our_books, amount_their_books=amount_their_books or None,
            matched=matched,
        ))

    return schemas.ReconciliationOut(
        counterparty_id=counterparty.id, counterparty_name=counterparty.name,
        our_balance=round(our_balance, 2), their_balance_mirrored=round(-our_balance, 2),
        rows=rows,
    )


# ---------------------------------------------------------------------------
# Receivables / Payables — party account balances, grouped
# ---------------------------------------------------------------------------
@router.get("/receivables-payables", response_model=schemas.ReceivablesPayablesOut)
def receivables_payables(
    as_of: Optional[date] = None,
    db: Session = Depends(get_db),
    current: models.Company = Depends(security.get_current_company),
):
    as_of = as_of or date.today()
    party_accounts = (
        db.query(models.Account)
        .filter(
            models.Account.company_id == current.id,
            models.Account.type.in_([models.AccountType.PARTY_RECEIVABLE, models.AccountType.PARTY_PAYABLE]),
        )
        .all()
    )

    # net by counterparty (receivable acct is +debit-normal, payable acct is +credit-normal)
    net_by_company = {}
    name_by_company = {}
    for acct in party_accounts:
        q = (
            db.query(models.JournalLine)
            .join(models.JournalEntry, models.JournalLine.entry_id == models.JournalEntry.id)
            .filter(models.JournalLine.account_id == acct.id, models.JournalEntry.entry_date <= as_of)
        )
        debit_sum = sum(l.debit for l in q) or 0.0
        credit_sum = sum(l.credit for l in q) or 0.0
        net = debit_sum - credit_sum  # receivable acct: + means they owe us; payable acct: - means we owe them (credit heavy)
        cp_id = acct.counterparty_company_id
        cp = db.query(models.Company).filter(models.Company.id == cp_id).first()
        name_by_company[cp_id] = cp.name if cp else "Unknown"
        net_by_company[cp_id] = net_by_company.get(cp_id, 0.0) + net

    receivables = []
    payables = []
    total_recv = 0.0
    total_pay = 0.0
    for cp_id, net in net_by_company.items():
        net = round(net, 2)
        if net > 0:
            receivables.append(schemas.PartyBalanceRow(company_id=cp_id, company_name=name_by_company[cp_id], balance=net))
            total_recv += net
        elif net < 0:
            payables.append(schemas.PartyBalanceRow(company_id=cp_id, company_name=name_by_company[cp_id], balance=net))
            total_pay += -net

    receivables.sort(key=lambda r: -r.balance)
    payables.sort(key=lambda r: r.balance)

    return schemas.ReceivablesPayablesOut(
        as_of=as_of, receivables=receivables, payables=payables,
        total_receivable=round(total_recv, 2), total_payable=round(total_pay, 2),
    )
