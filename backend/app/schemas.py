from datetime import date, datetime
from typing import Optional, List
from pydantic import BaseModel, EmailStr, ConfigDict


# ---------- Companies / Auth ----------
class CompanyCreate(BaseModel):
    name: str
    email: EmailStr
    password: str
    gstin_or_tax_id: Optional[str] = None


class CompanyLogin(BaseModel):
    email: EmailStr
    password: str


class CompanyOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    name: str
    email: EmailStr
    gstin_or_tax_id: Optional[str] = None
    connect_code: str


class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"
    company: CompanyOut


class ConnectRequest(BaseModel):
    connect_code: str


# ---------- Accounts ----------
class AccountOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    name: str
    group: str
    type: str
    counterparty_company_id: Optional[str] = None


class AccountHeadOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    name: str
    description: Optional[str] = None


class AccountHeadMappingIn(BaseModel):
    head_id: str
    account_id: str


class AccountHeadMappingOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    company_id: str
    head_id: str
    account_id: str


class AccountCreate(BaseModel):
    name: str
    group: str  # ASSET / LIABILITY / INCOME / EXPENSE / EQUITY


# ---------- Transactions ----------
class TransactionLineIn(BaseModel):
    item_name: str
    quantity: float = 1.0
    rate: float = 0.0
    gst_percent: float = 0.0
    gst_amount: float = 0.0

    @property
    def amount(self) -> float:
        return round(self.quantity * self.rate, 2)


class TransactionLineOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    item_name: str
    quantity: float
    rate: float
    amount: float
    gst_percent: float = 0.0
    gst_amount: float = 0.0


class TransactionCreate(BaseModel):
    type: str  # SALE_PURCHASE | PAYMENT_RECEIPT
    recipient_company_id: str
    txn_date: Optional[date] = None
    narration: Optional[str] = None
    # for SALE_PURCHASE
    lines: Optional[List[TransactionLineIn]] = None
    # for PAYMENT_RECEIPT
    amount: Optional[float] = None
    sender_cash_account_id: Optional[str] = None


class TakeTransactionIn(BaseModel):
    # only needed for PAYMENT_RECEIPT, so the recipient can choose which
    # cash/bank account received the funds. Sale/Purchase needs nothing —
    # true zero-data-entry acknowledgment.
    recipient_cash_account_id: Optional[str] = None
    recipient_purchase_account_id: Optional[str] = None


class SendTransactionIn(BaseModel):
    sender_cash_account_id: Optional[str] = None
    sender_sales_account_id: Optional[str] = None


class RejectTransactionIn(BaseModel):
    reason: Optional[str] = None


class TransactionOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    type: str
    state: str
    sender_company_id: str
    recipient_company_id: str
    voucher_no: Optional[str] = None
    txn_date: date
    narration: Optional[str] = None
    total_amount: float
    created_at: datetime
    sent_at: Optional[datetime] = None
    taken_at: Optional[datetime] = None
    lines: List[TransactionLineOut] = []
    sender_company_name: Optional[str] = None
    recipient_company_name: Optional[str] = None


# ---------- Reports ----------
class LedgerLineOut(BaseModel):
    date: date
    voucher_type: str
    voucher_no: Optional[str]
    narration: Optional[str]
    debit: float
    credit: float
    balance: float


class LedgerReportOut(BaseModel):
    account_id: str
    account_name: str
    opening_balance: float
    closing_balance: float
    lines: List[LedgerLineOut]


class TrialBalanceRow(BaseModel):
    account_id: str
    account_name: str
    group: str
    debit: float
    credit: float


class TrialBalanceOut(BaseModel):
    as_of: date
    rows: List[TrialBalanceRow]
    total_debit: float
    total_credit: float


class ReconciliationRow(BaseModel):
    transaction_id: str
    txn_date: date
    voucher_no: Optional[str]
    type: str
    state: str
    amount_our_books: float
    amount_their_books: Optional[float]
    matched: bool


class ReconciliationOut(BaseModel):
    counterparty_id: str
    counterparty_name: str
    our_balance: float           # positive = they owe us, negative = we owe them
    their_balance_mirrored: float
    rows: List[ReconciliationRow]


class PartyBalanceRow(BaseModel):
    company_id: str
    company_name: str
    balance: float  # positive = receivable, negative = payable


class ReceivablesPayablesOut(BaseModel):
    as_of: date
    receivables: List[PartyBalanceRow]
    payables: List[PartyBalanceRow]
    total_receivable: float
    total_payable: float
