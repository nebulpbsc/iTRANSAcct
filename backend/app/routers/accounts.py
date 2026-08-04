from typing import List
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from .. import models, schemas, security
from ..database import get_db

router = APIRouter(prefix="/accounts", tags=["accounts"])


@router.get("", response_model=List[schemas.AccountOut])
def list_accounts(
    db: Session = Depends(get_db), current: models.Company = Depends(security.get_current_company)
):
    accts = db.query(models.Account).filter(models.Account.company_id == current.id).order_by(models.Account.name).all()
    return accts


@router.post("", response_model=schemas.AccountOut)
def create_account(
    payload: schemas.AccountCreate,
    db: Session = Depends(get_db),
    current: models.Company = Depends(security.get_current_company),
):
    """Companies can add their own custom ledgers (e.g. 'Bank - HDFC', 'Office Rent')
    beyond the auto-provisioned system accounts and party accounts."""
    try:
        group = models.AccountGroup(payload.group)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid account group")

    existing = (
        db.query(models.Account)
        .filter(models.Account.company_id == current.id, models.Account.name == payload.name)
        .first()
    )
    if existing:
        raise HTTPException(status_code=400, detail="An account with this name already exists")

    acct = models.Account(company_id=current.id, name=payload.name, group=group, type=models.AccountType.STANDARD)
    db.add(acct)
    db.commit()
    db.refresh(acct)
    return acct
