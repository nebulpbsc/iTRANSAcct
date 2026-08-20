from datetime import date, datetime
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from .. import models, schemas, security, posting
from sqlalchemy import text
from ..database import get_db
from sqlalchemy import inspect
from sqlalchemy.exc import OperationalError

router = APIRouter(prefix="/transactions", tags=["transactions"])


def _to_out(txn: models.Transaction) -> schemas.TransactionOut:
    # Build a plain dict and load lines via an explicit safe query so we only
    # select columns that actually exist in the DB (avoids OperationalError
    # when older schemas lack account_id)
    from sqlalchemy import select
    from sqlalchemy import inspect
    from sqlalchemy.orm import object_session

    txnd = {
        "id": txn.id,
        "type": txn.type.value if txn.type is not None else None,
        "state": txn.state.value if txn.state is not None else None,
        "sender_company_id": txn.sender_company_id,
        "recipient_company_id": txn.recipient_company_id,
        "voucher_no": txn.voucher_no,
        "txn_date": txn.txn_date,
        "narration": txn.narration,
        "total_amount": txn.total_amount,
        "created_at": txn.created_at,
        "sent_at": txn.sent_at,
        "taken_at": txn.taken_at,
        "lines": [],
    }

    session = object_session(txn)
    if session is not None:
        try:
            cols = {c['name'] for c in inspect(session.bind).get_columns('transaction_lines')}
        except Exception:
            cols = set()

        # build selected columns list based on availability
        sel_cols = [models.TransactionLine.id, models.TransactionLine.item_name, models.TransactionLine.quantity,
                    models.TransactionLine.rate, models.TransactionLine.amount,
                    models.TransactionLine.sgst_percent, models.TransactionLine.cgst_percent,
                    models.TransactionLine.sgst_amount, models.TransactionLine.cgst_amount]
        if 'account_id' in cols:
            sel_cols.append(models.TransactionLine.account_id)

        stmt = select(*sel_cols).where(models.TransactionLine.transaction_id == txn.id)
        res = session.execute(stmt).all()
        for row in res:
            # row is a Row; map by positional order
            l = {
                "id": row[0],
                "item_name": row[1],
                "quantity": row[2],
                "rate": row[3],
                "amount": row[4],
                "sgst_percent": row[5] if len(row) > 5 else 0.0,
                "cgst_percent": row[6] if len(row) > 6 else 0.0,
                "sgst_amount": row[7] if len(row) > 7 else 0.0,
                "cgst_amount": row[8] if len(row) > 8 else 0.0,
            }
            if 'account_id' in cols:
                # account_id will be the last appended
                l['account_id'] = row[9] if len(row) > 9 else None
            txnd['lines'].append(l)
    else:
        # fallback: attempt to read from ORM object but guard access
        for ln in getattr(txn, 'lines', []) or []:
            try:
                l = {
                    'id': ln.id,
                    'item_name': ln.item_name,
                    'quantity': getattr(ln, 'quantity', None),
                    'rate': getattr(ln, 'rate', None),
                    'amount': getattr(ln, 'amount', None),
                    'sgst_percent': getattr(ln, 'sgst_percent', 0.0),
                    'cgst_percent': getattr(ln, 'cgst_percent', 0.0),
                    'sgst_amount': getattr(ln, 'sgst_amount', 0.0),
                    'cgst_amount': getattr(ln, 'cgst_amount', 0.0),
                    'account_id': getattr(ln, 'account_id', None),
                }
            except Exception:
                l = {'id': getattr(ln, 'id', None), 'item_name': getattr(ln, 'item_name', None)}
            txnd['lines'].append(l)

    out = schemas.TransactionOut.model_validate(txnd)
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
        # detect whether the DB table has the optional account_id column
        try:
            inspector = inspect(db.bind)
            txn_line_columns = {c['name'] for c in inspector.get_columns('transaction_lines')}
        except Exception:
            txn_line_columns = set()
        has_account_col = 'account_id' in txn_line_columns
        for line in payload.lines:
            amount = round(line.quantity * line.rate, 2)
            sgst_percent = getattr(line, "sgst_percent", 0.0) or 0.0
            cgst_percent = getattr(line, "cgst_percent", 0.0) or 0.0
            sgst_amount = round(amount * (sgst_percent / 100.0), 2)
            cgst_amount = round(amount * (cgst_percent / 100.0), 2)
            total += amount + sgst_amount + cgst_amount
            if has_account_col:
                tl = models.TransactionLine(
                    transaction_id=txn.id, item_name=line.item_name,
                    quantity=line.quantity, rate=line.rate, amount=amount,
                    sgst_percent=sgst_percent, cgst_percent=cgst_percent,
                    sgst_amount=sgst_amount, cgst_amount=cgst_amount,
                )
                try:
                    tl.account_id = getattr(line, "account_id", None)
                except OperationalError:
                    pass
                db.add(tl)
            else:
                # Raw insert into transaction_lines avoiding account_id column (older DBs)
                stmt = text(
                    "INSERT INTO transaction_lines (id, transaction_id, item_name, quantity, rate, amount, sgst_percent, cgst_percent, sgst_amount, cgst_amount) VALUES (:id, :transaction_id, :item_name, :quantity, :rate, :amount, :sgst_percent, :cgst_percent, :sgst_amount, :cgst_amount)"
                )
                params = {
                    "id": models.gen_id(),
                    "transaction_id": txn.id,
                    "item_name": line.item_name,
                    "quantity": line.quantity,
                    "rate": line.rate,
                    "amount": amount,
                    "sgst_percent": sgst_percent,
                    "cgst_percent": cgst_percent,
                    "sgst_amount": sgst_amount,
                    "cgst_amount": cgst_amount,
                }
                db.execute(stmt, params)
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
    # If recipient provided per-line account assignments, validate and persist them
    if getattr(payload, "line_account_assignments", None):
        for assign in payload.line_account_assignments:
            # ensure the line exists and belongs to this transaction
            line = db.query(models.TransactionLine).filter(models.TransactionLine.id == assign.line_id, models.TransactionLine.transaction_id == txn.id).first()
            if not line:
                raise HTTPException(status_code=400, detail=f"Invalid line id: {assign.line_id}")
            # if account_id provided, ensure it belongs to recipient company
            if assign.account_id:
                acct = db.query(models.Account).filter(models.Account.id == assign.account_id, models.Account.company_id == current.id).first()
                if not acct:
                    raise HTTPException(status_code=400, detail=f"Account not found for recipient: {assign.account_id}")
                line.account_id = assign.account_id
        db.commit()

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
