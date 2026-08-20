from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .database import Base, engine
from . import models  # noqa: F401 -- ensures models are registered before create_all
from .routers import auth, companies, accounts, transactions, reports, journals

Base.metadata.create_all(bind=engine)

app = FastAPI(
    title="iTransAcct API",
    description="Single data entry, dual bookkeeping accounting platform.",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # tighten this to your frontend's origin in production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(companies.router)
app.include_router(accounts.router)
app.include_router(transactions.router)
app.include_router(reports.router)
app.include_router(journals.router)


@app.get("/")
def root():
    return {"status": "ok", "service": "iTransAcct API"}


@app.get("/health")
def health():
    return {"status": "healthy"}
