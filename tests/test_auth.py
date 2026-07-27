import pytest
from flask import Flask
from ingest.auth import require_secret


@pytest.fixture
def app(monkeypatch):
    monkeypatch.setenv("INGEST_SHARED_SECRET", "s3cret")
    app = Flask(__name__)

    @app.post("/guarded")
    @require_secret
    def guarded():
        return {"ok": True}

    return app


def test_rejects_missing_secret(app):
    res = app.test_client().post("/guarded")
    assert res.status_code == 401


def test_rejects_wrong_secret(app):
    res = app.test_client().post("/guarded", headers={"X-Ingest-Secret": "nope"})
    assert res.status_code == 401


def test_accepts_correct_secret(app):
    res = app.test_client().post("/guarded", headers={"X-Ingest-Secret": "s3cret"})
    assert res.status_code == 200
    assert res.get_json() == {"ok": True}
