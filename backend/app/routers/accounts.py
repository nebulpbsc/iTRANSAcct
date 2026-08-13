from typing import List
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from .. import models, schemas, security
from ..database import get_db
from sqlalchemy.orm import Session
from fastapi import Body

router = APIRouter(prefix="/accounts", tags=["accounts"])


@router.get("", response_model=List[schemas.AccountOut])
def list_accounts(
    db: Session = Depends(get_db), current: models.Company = Depends(security.get_current_company)
):
    accts = db.query(models.Account).filter(models.Account.company_id == current.id).order_by(models.Account.name).all()
    return accts


@router.get("/heads", response_model=list[schemas.AccountHeadOut])
def list_heads(db: Session = Depends(get_db)):
    heads = db.query(models.AccountHead).order_by(models.AccountHead.name).all()
    return heads


@router.get("/mapping", response_model=list[schemas.AccountHeadMappingOut])
def get_mappings(db: Session = Depends(get_db), current: models.Company = Depends(security.get_current_company)):
    maps = db.query(models.AccountHeadMapping).filter(models.AccountHeadMapping.company_id == current.id).all()
    return maps


@router.post("/mapping", response_model=schemas.AccountHeadMappingOut)
def set_mapping(
    payload: schemas.AccountHeadMappingIn,
    db: Session = Depends(get_db),
    current: models.Company = Depends(security.get_current_company),
):
    head = db.query(models.AccountHead).filter(models.AccountHead.id == payload.head_id).first()
    if not head:
        raise HTTPException(status_code=404, detail="Account head not found")
    acct = db.query(models.Account).filter(models.Account.id == payload.account_id, models.Account.company_id == current.id).first()
    if not acct:
        raise HTTPException(status_code=404, detail="Account not found for this company")

    existing = (
        db.query(models.AccountHeadMapping)
        .filter(models.AccountHeadMapping.company_id == current.id, models.AccountHeadMapping.head_id == payload.head_id)
        .first()
    )
    if existing:
        existing.account_id = payload.account_id
        db.commit()
        db.refresh(existing)
        return existing

    mapping = models.AccountHeadMapping(company_id=current.id, head_id=payload.head_id, account_id=payload.account_id)
    db.add(mapping)
    db.commit()
    db.refresh(mapping)
    return mapping


@router.delete("/mapping/{mapping_id}")
def delete_mapping(mapping_id: str, db: Session = Depends(get_db), current: models.Company = Depends(security.get_current_company)):
    mapping = db.query(models.AccountHeadMapping).filter(models.AccountHeadMapping.id == mapping_id).first()
    if not mapping:
        raise HTTPException(status_code=404, detail="Mapping not found")
    if mapping.company_id != current.id:
        raise HTTPException(status_code=403, detail="Not allowed to delete this mapping")
    db.delete(mapping)
    db.commit()
    return {"status": "deleted"}


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
