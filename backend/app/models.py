"""
ORM models for the iTransAcct-style accounting platform.

Core idea (single data entry, dual bookkeeping):
------------------------------------------------
A Transaction is created ONCE, by the initiator (sender), in DRAFT state.
- SALE_PURCHASE : sender records it as a Sale; recipient will see it as a Purchase.
- PAYMENT_RECEIPT: sender records it as a Payment; recipient will see it as a Receipt.

State machine:  DRAFT -> SENT -> TAKEN   (or SENT -> REJECTED)
  pink            green      blue

- DRAFT  : only visible/editable by the initiator. No accounting impact yet.
- SENT   : initiator has transmitted it. A journal entry is AUTO-POSTED to the
           initiator's own books at this moment. The transaction now appears
           in the counterparty's Inbox, read-only.
- TAKEN  : counterparty acknowledges (one click, zero data entry). A MIRRORED
           journal entry is AUTO-POSTED to the counterparty's books. Both
           companies' books are now updated from a single keystroke of data.
- REJECTED: counterparty declines; no posting happens on their side, and the
           sender is notified (their own SENT-side posting can be reversed
           separately if desired — see routers/transactions.py).

Every company keeps its own independent Chart of Accounts, INCLUDING one
special "party account" per counterparty it has ever transacted with (acts
like a Tally-style Sundry Debtor/Creditor ledger). Because both sides post
mirrored, equal-and-opposite entries against each other's party account,
the Reconciliation report can compare "as per our books" vs "as per their
books" with zero manual matching.
"""
import enum
import uuid
from datetime import datetime, date

from sqlalchemy import (
    Column, String, Integer, Float, Boolean, Date, DateTime,
    ForeignKey, Enum as SAEnum, Text, UniqueConstraint
)
from sqlalchemy.orm import relationship

from .database import Base


def gen_id() -> str:
    return uuid.uuid4().hex[:12]


# ---------------------------------------------------------------------------
# Companies (a Company is the "User" / tenant of this application)
# ---------------------------------------------------------------------------
class Company(Base):
    __tablename__ = "companies"

    id = Column(String, primary_key=True, default=gen_id)
    name = Column(String, nullable=False)
    gstin_or_tax_id = Column(String, nullable=True)
    email = Column(String, unique=True, nullable=False, index=True)
    hashed_password = Column(String, nullable=False)
    connect_code = Column(String, unique=True, index=True, default=gen_id)  # share this to let others find you
    created_at = Column(DateTime, default=datetime.utcnow)

    accounts = relationship("Account", back_populates="company", cascade="all, delete-orphan")
    sent_transactions = relationship(
        "Transaction", foreign_keys="Transaction.sender_company_id", back_populates="sender_company"
    )
    received_transactions = relationship(
        "Transaction", foreign_keys="Transaction.recipient_company_id", back_populates="recipient_company"
    )


class ConnectionRequest(Base):
    """Lightweight 'follow/connect' link so two companies can transact.

    Mirrors real-world onboarding: a company must be connected to a
    counterparty before it can send them a transaction (prevents spam
    postings to arbitrary companies).
    """
    __tablename__ = "connections"
    __table_args__ = (UniqueConstraint("company_id", "counterparty_id", name="uq_connection_pair"),)

    id = Column(String, primary_key=True, default=gen_id)
    company_id = Column(String, ForeignKey("companies.id"), nullable=False)
    counterparty_id = Column(String, ForeignKey("companies.id"), nullable=False)
    status = Column(String, default="ACCEPTED")  # simplified: auto-accept on connect-code match
    created_at = Column(DateTime, default=datetime.utcnow)


# ---------------------------------------------------------------------------
# Chart of Accounts
# ---------------------------------------------------------------------------
class AccountGroup(str, enum.Enum):
    ASSET = "ASSET"
    LIABILITY = "LIABILITY"
    INCOME = "INCOME"
    EXPENSE = "EXPENSE"
    EQUITY = "EQUITY"


class AccountType(str, enum.Enum):
    STANDARD = "STANDARD"          # Sales, Purchases, Bank, Cash, Tax accounts, etc.
    PARTY_RECEIVABLE = "PARTY_RECEIVABLE"  # auto-created per counterparty (Sundry Debtor)
    PARTY_PAYABLE = "PARTY_PAYABLE"        # auto-created per counterparty (Sundry Creditor)


class Account(Base):
    __tablename__ = "accounts"
    __table_args__ = (UniqueConstraint("company_id", "name", name="uq_account_name_per_company"),)

    id = Column(String, primary_key=True, default=gen_id)
    company_id = Column(String, ForeignKey("companies.id"), nullable=False)
    name = Column(String, nullable=False)
    group = Column(SAEnum(AccountGroup), nullable=False)
    type = Column(SAEnum(AccountType), default=AccountType.STANDARD)
    # if this is a party account, which counterparty company it represents
    counterparty_company_id = Column(String, ForeignKey("companies.id"), nullable=True)
    is_system = Column(Boolean, default=False)  # protects Sales/Purchase/Bank from deletion

    company = relationship("Company", back_populates="accounts", foreign_keys=[company_id])


# ---------------------------------------------------------------------------
# Transactions (the single point of data entry)
# ---------------------------------------------------------------------------
class TransactionType(str, enum.Enum):
    SALE_PURCHASE = "SALE_PURCHASE"     # sender = Sale voucher, recipient = Purchase voucher
    PAYMENT_RECEIPT = "PAYMENT_RECEIPT"  # sender = Payment voucher, recipient = Receipt voucher


class TransactionState(str, enum.Enum):
    DRAFT = "DRAFT"        # pink
    SENT = "SENT"          # green
    TAKEN = "TAKEN"        # blue
    REJECTED = "REJECTED"  # counterparty declined


class Transaction(Base):
    __tablename__ = "transactions"

    id = Column(String, primary_key=True, default=gen_id)
    type = Column(SAEnum(TransactionType), nullable=False)
    state = Column(SAEnum(TransactionState), default=TransactionState.DRAFT, nullable=False)

    sender_company_id = Column(String, ForeignKey("companies.id"), nullable=False)
    recipient_company_id = Column(String, ForeignKey("companies.id"), nullable=False)

    voucher_no = Column(String, nullable=True)   # assigned on Send, sequential per company+type
    txn_date = Column(Date, default=date.today)
    narration = Column(Text, nullable=True)
    total_amount = Column(Float, default=0.0)

    # bank/cash account used on the sender's side, for PAYMENT_RECEIPT only
    sender_cash_account_id = Column(String, ForeignKey("accounts.id"), nullable=True)
    # bank/cash account used on the recipient's side, for PAYMENT_RECEIPT only (recipient picks on Take)
    recipient_cash_account_id = Column(String, ForeignKey("accounts.id"), nullable=True)

    created_at = Column(DateTime, default=datetime.utcnow)
    sent_at = Column(DateTime, nullable=True)
    taken_at = Column(DateTime, nullable=True)

    sender_journal_entry_id = Column(String, ForeignKey("journal_entries.id"), nullable=True)
    recipient_journal_entry_id = Column(String, ForeignKey("journal_entries.id"), nullable=True)

    sender_company = relationship("Company", foreign_keys=[sender_company_id], back_populates="sent_transactions")
    recipient_company = relationship("Company", foreign_keys=[recipient_company_id], back_populates="received_transactions")
    lines = relationship("TransactionLine", back_populates="transaction", cascade="all, delete-orphan")


class TransactionLine(Base):
    """Item lines — used for SALE_PURCHASE transactions only."""
    __tablename__ = "transaction_lines"

    id = Column(String, primary_key=True, default=gen_id)
    transaction_id = Column(String, ForeignKey("transactions.id"), nullable=False)
    item_name = Column(String, nullable=False)
    quantity = Column(Float, default=1.0)
    rate = Column(Float, default=0.0)
    amount = Column(Float, default=0.0)

    transaction = relationship("Transaction", back_populates="lines")


# ---------------------------------------------------------------------------
# Journals (auto-posted only — no manual journal entry screen exists)
# ---------------------------------------------------------------------------
class JournalEntry(Base):
    __tablename__ = "journal_entries"

    id = Column(String, primary_key=True, default=gen_id)
    company_id = Column(String, ForeignKey("companies.id"), nullable=False)
    transaction_id = Column(String, ForeignKey("transactions.id"), nullable=True)
    voucher_type = Column(String, nullable=False)  # Sales / Purchase / Payment / Receipt
    voucher_no = Column(String, nullable=True)
    entry_date = Column(Date, default=date.today)
    narration = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    is_reversed = Column(Boolean, default=False)

    lines = relationship("JournalLine", back_populates="entry", cascade="all, delete-orphan")


class JournalLine(Base):
    __tablename__ = "journal_lines"

    id = Column(String, primary_key=True, default=gen_id)
    entry_id = Column(String, ForeignKey("journal_entries.id"), nullable=False)
    account_id = Column(String, ForeignKey("accounts.id"), nullable=False)
    debit = Column(Float, default=0.0)
    credit = Column(Float, default=0.0)

    entry = relationship("JournalEntry", back_populates="lines")
    account = relationship("Account")
