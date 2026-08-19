from typing import List
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from .. import models, schemas, security
from ..database import get_db
from sqlalchemy.orm import Session
from fastapi import Body
from fastapi import APIRouter

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


@router.post("/heads", response_model=schemas.AccountHeadOut)
def create_head(payload: schemas.AccountHeadCreate, db: Session = Depends(get_db)):
    existing = db.query(models.AccountHead).filter(models.AccountHead.name == payload.name).first()
    if existing:
        raise HTTPException(status_code=400, detail="Account head with this name already exists")
    head = models.AccountHead(name=payload.name, description=payload.description)
    db.add(head)
    db.commit()
    db.refresh(head)
    return head


@router.put("/heads/{head_id}", response_model=schemas.AccountHeadOut)
def update_head(head_id: str, payload: schemas.AccountHeadUpdate, db: Session = Depends(get_db)):
    head = db.query(models.AccountHead).filter(models.AccountHead.id == head_id).first()
    if not head:
        raise HTTPException(status_code=404, detail="Account head not found")
    if payload.name:
        # ensure unique
        q = db.query(models.AccountHead).filter(models.AccountHead.name == payload.name, models.AccountHead.id != head_id).first()
        if q:
            raise HTTPException(status_code=400, detail="Another account head with this name exists")
        head.name = payload.name
    if payload.description is not None:
        head.description = payload.description
    db.commit()
    db.refresh(head)
    return head


@router.delete("/heads/{head_id}")
def delete_head(head_id: str, db: Session = Depends(get_db)):
    head = db.query(models.AccountHead).filter(models.AccountHead.id == head_id).first()
    if not head:
        raise HTTPException(status_code=404, detail="Account head not found")
    # prevent deletion if mappings exist
    mapping = db.query(models.AccountHeadMapping).filter(models.AccountHeadMapping.head_id == head_id).first()
    if mapping:
        raise HTTPException(status_code=400, detail="Cannot delete head while mappings exist. Unmap first.")
    db.delete(head)
    db.commit()
    return {"status": "deleted"}


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


@router.put("/{account_id}", response_model=schemas.AccountOut)
def update_account(
    account_id: str,
    payload: schemas.AccountCreate,
    db: Session = Depends(get_db),
    current: models.Company = Depends(security.get_current_company),
):
    acct = db.query(models.Account).filter(models.Account.id == account_id).first()
    if not acct:
        raise HTTPException(status_code=404, detail="Account not found")
    if acct.company_id != current.id:
        raise HTTPException(status_code=403, detail="Not allowed to modify this account")
    if acct.is_system:
        raise HTTPException(status_code=400, detail="System accounts cannot be modified")
    try:
        group = models.AccountGroup(payload.group)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid account group")
    acct.name = payload.name
    acct.group = group
    db.commit()
    db.refresh(acct)
    return acct


@router.delete("/{account_id}")
def delete_account(account_id: str, db: Session = Depends(get_db), current: models.Company = Depends(security.get_current_company)):
    acct = db.query(models.Account).filter(models.Account.id == account_id).first()
    if not acct:
        raise HTTPException(status_code=404, detail="Account not found")
    if acct.company_id != current.id:
        raise HTTPException(status_code=403, detail="Not allowed to delete this account")
    if acct.is_system:
        raise HTTPException(status_code=400, detail="System accounts cannot be deleted")
    # prevent deleting if used in mappings
    mapping = db.query(models.AccountHeadMapping).filter(models.AccountHeadMapping.account_id == account_id).first()
    if mapping:
        raise HTTPException(status_code=400, detail="Cannot delete account while it is used in head mappings")
    db.delete(acct)
    db.commit()
    return {"status": "deleted"}
