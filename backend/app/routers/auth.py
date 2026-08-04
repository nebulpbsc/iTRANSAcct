from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from .. import models, schemas, security, posting
from ..database import get_db

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/register", response_model=schemas.Token)
def register(payload: schemas.CompanyCreate, db: Session = Depends(get_db)):
    existing = db.query(models.Company).filter(models.Company.email == payload.email).first()
    if existing:
        raise HTTPException(status_code=400, detail="A company with this email already exists")

    company = models.Company(
        name=payload.name,
        email=payload.email,
        hashed_password=security.hash_password(payload.password),
        gstin_or_tax_id=payload.gstin_or_tax_id,
    )
    db.add(company)
    db.commit()
    db.refresh(company)

    posting.ensure_system_accounts(db, company)

    token = security.create_access_token(company.id)
    return schemas.Token(access_token=token, company=schemas.CompanyOut.model_validate(company))


@router.post("/login", response_model=schemas.Token)
def login(payload: schemas.CompanyLogin, db: Session = Depends(get_db)):
    company = db.query(models.Company).filter(models.Company.email == payload.email).first()
    if not company or not security.verify_password(payload.password, company.hashed_password):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid email or password")

    token = security.create_access_token(company.id)
    return schemas.Token(access_token=token, company=schemas.CompanyOut.model_validate(company))


@router.get("/me", response_model=schemas.CompanyOut)
def me(current: models.Company = Depends(security.get_current_company)):
    return schemas.CompanyOut.model_validate(current)
