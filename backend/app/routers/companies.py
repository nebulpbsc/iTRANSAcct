from typing import List
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from .. import models, schemas, security
from ..database import get_db

router = APIRouter(prefix="/companies", tags=["companies"])


@router.get("/connections", response_model=List[schemas.CompanyOut])
def list_connections(
    db: Session = Depends(get_db), current: models.Company = Depends(security.get_current_company)
):
    """Companies I'm connected to (and can therefore transact with)."""
    links = db.query(models.ConnectionRequest).filter(models.ConnectionRequest.company_id == current.id).all()
    ids = [l.counterparty_id for l in links]
    if not ids:
        return []
    return db.query(models.Company).filter(models.Company.id.in_(ids)).all()


@router.post("/connect", response_model=schemas.CompanyOut)
def connect(
    payload: schemas.ConnectRequest,
    db: Session = Depends(get_db),
    current: models.Company = Depends(security.get_current_company),
):
    """Connect to another company via their share-able connect code.
    Auto-accepted for simplicity, and creates the reverse link too, so
    both sides can immediately send/receive transactions."""
    other = db.query(models.Company).filter(models.Company.connect_code == payload.connect_code).first()
    if not other:
        raise HTTPException(status_code=404, detail="No company found with that connect code")
    if other.id == current.id:
        raise HTTPException(status_code=400, detail="You can't connect to your own company")

    for a, b in [(current.id, other.id), (other.id, current.id)]:
        exists = (
            db.query(models.ConnectionRequest)
            .filter(models.ConnectionRequest.company_id == a, models.ConnectionRequest.counterparty_id == b)
            .first()
        )
        if not exists:
            db.add(models.ConnectionRequest(company_id=a, counterparty_id=b, status="ACCEPTED"))
    db.commit()
    return other
