"""
Optional demo script. Run this AFTER starting the API server
(uvicorn app.main:app --reload) to create two demo companies, connect them,
and walk one Sale and one Payment all the way through
DRAFT -> SENT -> TAKEN, so you can immediately explore the reports.

Usage:
    python seed_demo.py
"""
import requests

BASE = "http://localhost:8000"


def register(name, email, password):
    r = requests.post(f"{BASE}/auth/register", json={"name": name, "email": email, "password": password})
    r.raise_for_status()
    return r.json()


def auth_headers(token):
    return {"Authorization": f"Bearer {token}"}


def main():
    print("Registering demo companies...")
    acme = register("Acme Supplies Pvt Ltd", "acme@demo.com", "password123")
    bolt = register("Bolt Retail Inc", "bolt@demo.com", "password123")

    acme_h = auth_headers(acme["access_token"])
    bolt_h = auth_headers(bolt["access_token"])

    print("Connecting the two companies...")
    requests.post(f"{BASE}/companies/connect", json={"connect_code": bolt["company"]["connect_code"]}, headers=acme_h).raise_for_status()

    print("Acme creates a Sale (DRAFT) to Bolt...")
    txn = requests.post(
        f"{BASE}/transactions",
        json={
            "type": "SALE_PURCHASE",
            "recipient_company_id": bolt["company"]["id"],
            "narration": "August stock order",
            "lines": [
                {"item_name": "Steel Rods (10mm)", "quantity": 100, "rate": 55.0},
                {"item_name": "Cement Bags", "quantity": 40, "rate": 320.0},
            ],
        },
        headers=acme_h,
    ).json()
    print(f"  Created {txn['id']} for total {txn['total_amount']} — state {txn['state']}")

    print("Acme sends it (auto-posts Sales voucher in Acme's books)...")
    txn = requests.post(f"{BASE}/transactions/{txn['id']}/send", headers=acme_h).json()
    print(f"  Voucher {txn['voucher_no']} — state {txn['state']}")

    print("Bolt takes it (zero data entry — auto-posts Purchase voucher in Bolt's books)...")
    txn = requests.post(f"{BASE}/transactions/{txn['id']}/take", json={}, headers=bolt_h).json()
    print(f"  state {txn['state']}")

    print("\nBolt now pays Acme part of the amount...")
    pay = requests.post(
        f"{BASE}/transactions",
        json={"type": "PAYMENT_RECEIPT", "recipient_company_id": acme["company"]["id"],
              "narration": "Partial payment for August order", "amount": 4000.0},
        headers=bolt_h,
    ).json()
    pay = requests.post(f"{BASE}/transactions/{pay['id']}/send", headers=bolt_h).json()
    print(f"  Bolt sent Payment {pay['voucher_no']}")
    pay = requests.post(f"{BASE}/transactions/{pay['id']}/take", json={}, headers=acme_h).json()
    print(f"  Acme took it as a Receipt — state {pay['state']}")

    print("\n--- Reports ---")
    rp = requests.get(f"{BASE}/reports/receivables-payables", headers=acme_h).json()
    print("Acme's Receivables/Payables:", rp)

    tb = requests.get(f"{BASE}/reports/trial-balance", headers=acme_h).json()
    print("\nAcme's Trial Balance:")
    for row in tb["rows"]:
        print(f"  {row['account_name']:35s} Dr {row['debit']:>10.2f}  Cr {row['credit']:>10.2f}")
    print(f"  {'TOTAL':35s} Dr {tb['total_debit']:>10.2f}  Cr {tb['total_credit']:>10.2f}")

    recon = requests.get(f"{BASE}/reports/reconciliation/{bolt['company']['id']}", headers=acme_h).json()
    print(f"\nReconciliation (Acme vs Bolt): our_balance={recon['our_balance']}  "
          f"their_balance_mirrored={recon['their_balance_mirrored']}")

    print("\nDemo companies:")
    print(f"  Acme  login: acme@demo.com / password123")
    print(f"  Bolt  login: bolt@demo.com / password123")


if __name__ == "__main__":
    main()
