# #region verify
import asyncio
import os

from solana.rpc.async_api import AsyncClient
from solana.rpc.commitment import Confirmed
from solders.signature import Signature

RPC_URL = os.environ.get("RPC_URL", "https://api.devnet.solana.com")
USDC_MINT = os.environ.get("USDC_MINT", "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU")


async def verify_payment(signature: str, store_owner: str, amount: int, reference: str):
    """Return (paid, reason) for a USDC payment of `amount` base units."""
    async with AsyncClient(RPC_URL) as client:
        resp = await client.get_transaction(
            Signature.from_string(signature),
            encoding="jsonParsed",
            commitment=Confirmed,
            max_supported_transaction_version=0,
        )
    tx = resp.value
    if tx is None:
        return False, "transaction not found"
    meta = tx.transaction.meta
    if meta.err is not None:
        return False, "transaction failed"

    keys = [str(k.pubkey) for k in tx.transaction.transaction.message.account_keys]
    if reference not in keys:
        return False, "reference not found"

    def balance(balances):
        for b in balances or []:
            if str(b.owner) == store_owner and str(b.mint) == USDC_MINT:
                return int(b.ui_token_amount.amount)
        return 0

    received = balance(meta.post_token_balances) - balance(meta.pre_token_balances)
    if received != amount:
        return False, f"amount mismatch: expected {amount}, received {received}"
    return True, None
# #endregion verify


if __name__ == "__main__":
    import sys

    sig, owner, amount, ref = sys.argv[1:5]
    paid, reason = asyncio.run(verify_payment(sig, owner, int(amount), ref))
    print(f"paid: {paid}" + (f", reason: {reason}" if reason else ""))
