from typing import List
from datetime import date
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from .. import models, schemas, security
from ..database import get_db

router = APIRouter(prefix="/journals", tags=["journals"])


@router.get("", response_model=List[schemas.JournalEntryOut])
def list_journals(db: Session = Depends(get_db), current: models.Company = Depends(security.get_current_company)):
    entries = db.query(models.JournalEntry).filter(models.JournalEntry.company_id == current.id).order_by(models.JournalEntry.entry_date.desc()).all()
    # build out lines
    result = []
    for e in entries:
        obj = schemas.JournalEntryOut.model_validate(e)
        obj.lines = [schemas.JournalLineOut.model_validate(l) for l in e.lines]
        result.append(obj)
    return result


@router.get("/{entry_id}", response_model=schemas.JournalEntryOut)
def get_journal(entry_id: str, db: Session = Depends(get_db), current: models.Company = Depends(security.get_current_company)):
    e = db.query(models.JournalEntry).filter(models.JournalEntry.id == entry_id, models.JournalEntry.company_id == current.id).first()
    if not e:
        raise HTTPException(status_code=404, detail="Journal entry not found")
    obj = schemas.JournalEntryOut.model_validate(e)
    obj.lines = [schemas.JournalLineOut.model_validate(l) for l in e.lines]
    return obj


@router.post("", response_model=schemas.JournalEntryOut)
def create_journal(payload: schemas.JournalEntryCreate, db: Session = Depends(get_db), current: models.Company = Depends(security.get_current_company)):
    if not payload.lines or len(payload.lines) == 0:
        raise HTTPException(status_code=400, detail="At least one line is required")
    total_dr = sum(l.debit for l in payload.lines)
    total_cr = sum(l.credit for l in payload.lines)
    if round(total_dr, 2) != round(total_cr, 2):
        raise HTTPException(status_code=400, detail=f"Unbalanced journal: Dr {total_dr} != Cr {total_cr}")

    je = models.JournalEntry(company_id=current.id, transaction_id=None, voucher_type=payload.voucher_type, entry_date=payload.entry_date or date.today(), narration=payload.narration)
    db.add(je)
    db.flush()
    # create lines
    for l in payload.lines:
        acct = db.query(models.Account).filter(models.Account.id == l.account_id, models.Account.company_id == current.id).first()
        if not acct:
            raise HTTPException(status_code=400, detail=f"Account not found: {l.account_id}")
        jl = models.JournalLine(entry_id=je.id, account_id=l.account_id, debit=round(l.debit,2), credit=round(l.credit,2))
        db.add(jl)
    # compute voucher_no
    je.voucher_no = None
    db.commit()
    db.refresh(je)
    obj = schemas.JournalEntryOut.model_validate(je)
    obj.lines = [schemas.JournalLineOut.model_validate(l) for l in je.lines]
    return obj
