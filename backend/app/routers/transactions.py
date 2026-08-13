from datetime import date, datetime
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from .. import models, schemas, security, posting
from ..database import get_db

router = APIRouter(prefix="/transactions", tags=["transactions"])


def _to_out(txn: models.Transaction) -> schemas.TransactionOut:
    out = schemas.TransactionOut.model_validate(txn)
    out.sender_company_name = txn.sender_company.name if txn.sender_company else None
    out.recipient_company_name = txn.recipient_company.name if txn.recipient_company else None
    return out


def _assert_connected(db: Session, company_id: str, other_id: str):
    link = (
        db.query(models.ConnectionRequest)
        .filter(models.ConnectionRequest.company_id == company_id, models.ConnectionRequest.counterparty_id == other_id)
        .first()
    )
    if not link:
        raise HTTPException(status_code=400, detail="You must connect with this company before transacting")


# ---------------------------------------------------------------------------
# Create (DRAFT) — the ONE data-entry step in the whole workflow
# ---------------------------------------------------------------------------
@router.post("", response_model=schemas.TransactionOut)
def create_transaction(
    payload: schemas.TransactionCreate,
    db: Session = Depends(get_db),
    current: models.Company = Depends(security.get_current_company),
):
    try:
        txn_type = models.TransactionType(payload.type)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid transaction type")

    recipient = db.query(models.Company).filter(models.Company.id == payload.recipient_company_id).first()
    if not recipient:
        raise HTTPException(status_code=404, detail="Recipient company not found")
    if recipient.id == current.id:
        raise HTTPException(status_code=400, detail="Sender and recipient must be different companies")
    _assert_connected(db, current.id, recipient.id)

    txn = models.Transaction(
        type=txn_type,
        state=models.TransactionState.DRAFT,
        sender_company_id=current.id,
        recipient_company_id=recipient.id,
        txn_date=payload.txn_date or date.today(),
        narration=payload.narration,
        sender_cash_account_id=payload.sender_cash_account_id,
    )

    if txn_type == models.TransactionType.SALE_PURCHASE:
        if not payload.lines:
            raise HTTPException(status_code=400, detail="At least one item line is required for a sale")
        total = 0.0
        db.add(txn)
        db.flush()
        for line in payload.lines:
            amount = round(line.quantity * line.rate, 2)
            gst_percent = getattr(line, "gst_percent", 0.0) or 0.0
            gst_amount = round(amount * (gst_percent / 100.0), 2)
            total += amount + gst_amount
            db.add(models.TransactionLine(
                transaction_id=txn.id, item_name=line.item_name,
                quantity=line.quantity, rate=line.rate, amount=amount,
                gst_percent=gst_percent, gst_amount=gst_amount,
            ))
        txn.total_amount = round(total, 2)
    else:
        if not payload.amount or payload.amount <= 0:
            raise HTTPException(status_code=400, detail="A positive payment amount is required")
        txn.total_amount = round(payload.amount, 2)
        db.add(txn)

    db.commit()
    db.refresh(txn)
    return _to_out(txn)


# ---------------------------------------------------------------------------
# Send — auto-posts to the SENDER's books only
# ---------------------------------------------------------------------------
@router.post("/{txn_id}/send", response_model=schemas.TransactionOut)
def send_transaction(
    txn_id: str,
    payload: Optional[schemas.SendTransactionIn] = None,
    db: Session = Depends(get_db),
    current: models.Company = Depends(security.get_current_company),
):
    txn = db.query(models.Transaction).filter(models.Transaction.id == txn_id).first()
    if not txn:
        raise HTTPException(status_code=404, detail="Transaction not found")
    if txn.sender_company_id != current.id:
        raise HTTPException(status_code=403, detail="Only the initiator can send this transaction")
    if txn.state != models.TransactionState.DRAFT:
        raise HTTPException(status_code=400, detail=f"Transaction is already {txn.state.value}")
    # allow updating which sender cash or sales account to use at send-time
    sender_cash = None
    sender_sales = None
    if payload:
        sender_cash = getattr(payload, "sender_cash_account_id", None)
        sender_sales = getattr(payload, "sender_sales_account_id", None)
    if sender_cash:
        txn.sender_cash_account_id = sender_cash

    entry = posting.post_on_send(db, txn, sender_sales_account_id=sender_sales)
    txn.sender_journal_entry_id = entry.id
    txn.state = models.TransactionState.SENT
    txn.sent_at = datetime.utcnow()
    db.commit()
    db.refresh(txn)
    return _to_out(txn)


# ---------------------------------------------------------------------------
# Take — the ZERO-data-entry acknowledgment; auto-posts to RECIPIENT's books
# ---------------------------------------------------------------------------
@router.post("/{txn_id}/take", response_model=schemas.TransactionOut)
def take_transaction(
    txn_id: str,
    payload: schemas.TakeTransactionIn,
    db: Session = Depends(get_db),
    current: models.Company = Depends(security.get_current_company),
):
    txn = db.query(models.Transaction).filter(models.Transaction.id == txn_id).first()
    if not txn:
        raise HTTPException(status_code=404, detail="Transaction not found")
    if txn.recipient_company_id != current.id:
        raise HTTPException(status_code=403, detail="Only the recipient can take this transaction")
    if txn.state != models.TransactionState.SENT:
        raise HTTPException(status_code=400, detail=f"Transaction must be SENT before it can be taken (currently {txn.state.value})")

    entry = posting.post_on_take(db, txn, recipient_cash_account_id=payload.recipient_cash_account_id, recipient_purchase_account_id=payload.recipient_purchase_account_id)
    txn.recipient_journal_entry_id = entry.id
    txn.state = models.TransactionState.TAKEN
    txn.taken_at = datetime.utcnow()
    db.commit()
    db.refresh(txn)
    return _to_out(txn)


# ---------------------------------------------------------------------------
# Reject — recipient declines; nothing posted on their side
# ---------------------------------------------------------------------------
@router.post("/{txn_id}/reject", response_model=schemas.TransactionOut)
def reject_transaction(
    txn_id: str,
    payload: schemas.RejectTransactionIn,
    db: Session = Depends(get_db),
    current: models.Company = Depends(security.get_current_company),
):
    txn = db.query(models.Transaction).filter(models.Transaction.id == txn_id).first()
    if not txn:
        raise HTTPException(status_code=404, detail="Transaction not found")
    if txn.recipient_company_id != current.id:
        raise HTTPException(status_code=403, detail="Only the recipient can reject this transaction")
    if txn.state != models.TransactionState.SENT:
        raise HTTPException(status_code=400, detail=f"Only SENT transactions can be rejected (currently {txn.state.value})")

    txn.state = models.TransactionState.REJECTED
    reason = payload.reason or "Rejected by recipient"
    txn.narration = f"{txn.narration or ''}\n[REJECTED: {reason}]".strip()
    db.commit()
    db.refresh(txn)
    return _to_out(txn)


# ---------------------------------------------------------------------------
# Listing: Outbox (sent by me) / Inbox (sent to me) / Drafts
# ---------------------------------------------------------------------------
@router.get("/outbox", response_model=List[schemas.TransactionOut])
def outbox(
    state: Optional[str] = None,
    db: Session = Depends(get_db),
    current: models.Company = Depends(security.get_current_company),
):
    q = db.query(models.Transaction).filter(models.Transaction.sender_company_id == current.id)
    if state:
        q = q.filter(models.Transaction.state == models.TransactionState(state))
    txns = q.order_by(models.Transaction.created_at.desc()).all()
    return [_to_out(t) for t in txns]


@router.get("/inbox", response_model=List[schemas.TransactionOut])
def inbox(
    state: Optional[str] = None,
    db: Session = Depends(get_db),
    current: models.Company = Depends(security.get_current_company),
):
    q = db.query(models.Transaction).filter(
        models.Transaction.recipient_company_id == current.id,
        models.Transaction.state != models.TransactionState.DRAFT,
    )
    if state:
        q = q.filter(models.Transaction.state == models.TransactionState(state))
    txns = q.order_by(models.Transaction.created_at.desc()).all()
    return [_to_out(t) for t in txns]


@router.get("/{txn_id}", response_model=schemas.TransactionOut)
def get_transaction(
    txn_id: str, db: Session = Depends(get_db), current: models.Company = Depends(security.get_current_company)
):
    txn = db.query(models.Transaction).filter(models.Transaction.id == txn_id).first()
    if not txn:
        raise HTTPException(status_code=404, detail="Transaction not found")
    if current.id not in (txn.sender_company_id, txn.recipient_company_id):
        raise HTTPException(status_code=403, detail="Not your transaction")
    return _to_out(txn)
