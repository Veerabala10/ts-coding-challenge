import { Given, Then, When } from "@cucumber/cucumber";
import { TokenCreateTransaction, TokenType, TokenSupplyType, TokenMintTransaction, TokenAssociateTransaction, TransferTransaction, Hbar, TokenId, AccountId, TokenInfo, TokenInfoQuery, TransactionReceipt, PrivateKey, AccountBalanceQuery, AccountInfoQuery, TransactionRecordQuery } from "@hashgraph/sdk";
import { client, setTestAccountAsClientOperator, transferHbars, checkAccountBalanceForTestAccount, getPrivateKeyFromAccount } from "./utils/hedera-utils";
import { accounts } from "../../src/config";
import assert from "node:assert";

// Used only 4 accounts for testing, so added some additional logics to handle the expected cases.

// Store token ID and other state between steps
const MINIMUM_FEE_RESERVE = 100_000_000; // 1 HBAR in tinybars
let tokenId: TokenId;
let tokenDecimals = 2;
let tokenSupplied = 0;
let currentTokenInfo: TokenInfo;
let currentTransferTransaction: TransferTransaction;
let currentTransactionReceipt: TransactionReceipt;



Given(/^A Hedera account with more than (\d+) hbar$/, { timeout: 30000 }, async function (expectedBalance: number) {
    await setTestAccountAsClientOperator(0);
    await transferHbars(accounts[0].id, accounts[0].id, expectedBalance);
    const balance = await checkAccountBalanceForTestAccount(0);
    assert.ok(balance.hbars.toBigNumber().toNumber() > expectedBalance, "Account doesn't have enough hbars");
});

When(/^I create a token named Test Token \(HTT\)$/, { timeout: 30000 }, async function () {
    //Using account 0 as treasury.
    await setTestAccountAsClientOperator(0);
    tokenSupplied = 0
    const createTokenTx = await new TokenCreateTransaction()
        .setTokenName("Test Token")
        .setTokenSymbol("HTT")
        .setTokenType(TokenType.FungibleCommon)
        .setDecimals(tokenDecimals)
        .setInitialSupply(tokenSupplied)
        .setTreasuryAccountId(accounts[0].id)
        .setSupplyType(TokenSupplyType.Infinite)
        .setSupplyKey(getPrivateKeyFromAccount(0).publicKey)
        .execute(client);

    const receipt = await createTokenTx.getReceipt(client);
    tokenId = receipt.tokenId!;
    this.tokenId = tokenId;

    assert.strictEqual(receipt.status._code, 22);
    const balance = await getTokenBalance(accounts[0].id, tokenId);
    assert.strictEqual(balance, tokenSupplied, `Token should have ${tokenSupplied} tokens`);
});

Then(/^The token has the name "([^"]*)"$/, { timeout: 30000 }, async function (expectedName: string) {
    currentTokenInfo = await getTokenInfo(tokenId);
    assert.ok(currentTokenInfo.name !== null && currentTokenInfo.name !== undefined, "No name available, Token should have a name");
    assert.strictEqual(currentTokenInfo.name, expectedName, `Token should have name ${expectedName}`);
});

Then(/^The token has the symbol "([^"]*)"$/, { timeout: 30000 }, async function (expectedSymbol: string) {
    assert.strictEqual(currentTokenInfo.symbol, expectedSymbol, `Token should have symbol ${expectedSymbol}`);
});

Then(/^The token has (\d+) decimals$/, { timeout: 30000 }, async function (decimals: number) {
    assert.strictEqual(currentTokenInfo.decimals, decimals, `Token should have ${decimals} decimals`);
});

Then(/^The token is owned by the account$/, { timeout: 30000 }, async function () {
    // The treasury account (accounts[0]) is the owner
    assert.ok(currentTokenInfo.treasuryAccountId !== null && currentTokenInfo.treasuryAccountId !== undefined, "No Treasury account available, Tokens should be owned by the treasury account.")
    assert.strictEqual(currentTokenInfo.treasuryAccountId?.toString(), accounts[0].id, `Token should be owned by the treasury account ${accounts[0].id}`);
});

Then(/^An attempt to mint (\d+) additional tokens succeeds$/, { timeout: 30000 }, async function (amount: number) {
    await setTestAccountAsClientOperator(0);

    const mintTx = await new TokenMintTransaction()
        .setTokenId(tokenId)
        .setAmount(amount)
        .execute(client);

    const receipt = await mintTx.getReceipt(client);
    assert.strictEqual(receipt.status._code, 22);
    tokenSupplied += amount;

    const balance = await getTokenBalance(accounts[0].id, tokenId);
    assert.strictEqual(balance, tokenSupplied, `Token should have ${tokenSupplied} tokens`);
});

When(/^I create a fixed supply token named Test Token \(HTT\) with (\d+) tokens$/, { timeout: 30000 }, async function (initialSupply: number) {
    await setTestAccountAsClientOperator(0);
    tokenSupplied = initialSupply;
    const createTokenTx = new TokenCreateTransaction()
        .setTokenName("Test Token")
        .setTokenSymbol("HTT")
        .setTokenType(TokenType.FungibleCommon)
        .setDecimals(tokenDecimals)
        .setTreasuryAccountId(accounts[0].id)
        .setAdminKey(getPrivateKeyFromAccount(0).publicKey)
        .setSupplyType(TokenSupplyType.Finite)
        .setMaxSupply(initialSupply)
        .setInitialSupply(initialSupply)
        .freezeWith(client)

    const signedTx = await createTokenTx.sign(getPrivateKeyFromAccount(0));
    const createTokenTxResponse = await signedTx.execute(client)
    const receipt = await createTokenTxResponse.getReceipt(client);
    tokenId = receipt.tokenId!;
    this.tokenId = tokenId;

    assert.strictEqual(receipt.status._code, 22);
});

Then(/^The total supply of the token is (\d+)$/, { timeout: 30000 }, async function (expectedSupply: number) {
    // const balance = await getTokenBalance(accounts[0].id, tokenId);
    currentTokenInfo = await getTokenInfo(tokenId);
    assert.ok(currentTokenInfo.maxSupply !== null && currentTokenInfo.maxSupply !== undefined, "No max supply available, Token should have a max supply");
    assert.strictEqual(currentTokenInfo.maxSupply.toNumber(), expectedSupply, `Token should have a max supply of ${expectedSupply}`);
    // assert.strictEqual(balance, expectedSupply, `Token balance should be maximum of ${expectedSupply} tokens`);
});

Then(/^An attempt to mint tokens fails$/, { timeout: 30000 }, async function () {
    await setTestAccountAsClientOperator(0);

    await assert.rejects(
        async () => {
            const mintTx = await new TokenMintTransaction()
                .setTokenId(tokenId)
                .setAmount(1)
                .execute(client);

            await mintTx.getReceipt(client);
        },
        {
            message: /TOKEN_HAS_NO_SUPPLY_KEY/
        },
        'Minting should have failed with TOKEN_HAS_NO_SUPPLY_KEY error'
    );
});

Given(/^A first hedera account with more than (\d+) hbar$/, { timeout: 30000 }, async function (minHbars: number) {
    await setTestAccountAsClientOperator(0);
    await transferHbars(accounts[0].id, accounts[0].id, minHbars);
    const balance = await checkAccountBalanceForTestAccount(0);
    assert.ok(balance.hbars.toBigNumber().toNumber() > minHbars, "First account doesn't have enough hbars");
});

Given(/^A second Hedera account$/, async function () {
    await setTestAccountAsClientOperator(1);
    assert.ok(accounts[1], "Second account not found");
});

Given(/^A token named Test Token \(HTT\) with (\d+) tokens$/, { timeout: 30000 }, async function (expectedSupply: number) {
    currentTokenInfo = await getTokenInfo(tokenId);
    assert.ok(currentTokenInfo.maxSupply !== null && currentTokenInfo.maxSupply !== undefined, "No max supply available, Token should have a max supply");
    assert.strictEqual(currentTokenInfo.maxSupply.toNumber(), expectedSupply, `Token should have a max supply of ${expectedSupply}`);

});

Given(/^The first account holds (\d+) HTT tokens$/, { timeout: 30000 }, async function (amount: number) {
    await associateTokenWithAccountAsNeeded(tokenId, 1);
    await transferTokensWithExpectedAmount(tokenId, 0, 1, amount);
    await setTestAccountAsClientOperator(1);
    const balance = await getTokenBalance(accounts[1].id, tokenId);
    assert.strictEqual(balance, amount);
});


Given(/^The second account holds (\d+) HTT tokens$/, { timeout: 30000 }, async function (amount: number) {
    await associateTokenWithAccountAsNeeded(tokenId, 2);
    await transferTokensWithExpectedAmount(tokenId, 0, 2, amount);
    await setTestAccountAsClientOperator(2);
    const balance = await getTokenBalance(accounts[2].id, tokenId);
    assert.strictEqual(balance, amount);
});

Given(/^The third account holds (\d+) HTT tokens$/, { timeout: 30000 }, async function (amount: number) {
    await associateTokenWithAccountAsNeeded(tokenId, 3);
    await transferTokensWithExpectedAmount(tokenId, 0, 3, amount);
    await setTestAccountAsClientOperator(3);
    const balance = await getTokenBalance(accounts[3].id, tokenId);
    assert.strictEqual(balance, amount);
});

Given(/^The fourth account holds (\d+) HTT tokens$/, { timeout: 30000 }, async function (amount: number) {
    await associateTokenWithAccountAsNeeded(tokenId, 4);
    await transferTokensWithExpectedAmount(tokenId, 0, 4, amount);
    await setTestAccountAsClientOperator(4);
    const balance = await getTokenBalance(accounts[4].id, tokenId);
    assert.strictEqual(balance, amount);
});

When(/^The first account creates a transaction to transfer (\d+) HTT tokens to the second account$/, { timeout: 30000 }, async function (amount: number) {
    await setTestAccountAsClientOperator(1);
    currentTransferTransaction = createTokenTransferTransactionAndFreeze(tokenId, accounts[1].id, accounts[2].id, amount);
    assert.ok(currentTransferTransaction, "Transfer transaction not created");
});

When(/^The first account submits the transaction$/, { timeout: 30000 }, async function () {
    await setTestAccountAsClientOperator(1);
    const receipt = await transferTokensToTestAccount(currentTransferTransaction, getPrivateKeyFromAccount(1));
    assert.strictEqual(receipt.status._code, 22);
});

When(/^The second account creates a transaction to transfer (\d+) HTT tokens to the first account$/, { timeout: 30000 }, async function (amount: number) {
    await setTestAccountAsClientOperator(1);
    currentTransferTransaction = createTokenTransferTransactionAndFreeze(tokenId, accounts[2].id, accounts[1].id, amount);
    currentTransferTransaction.sign(getPrivateKeyFromAccount(2));
    assert.ok(currentTransferTransaction, "Transfer transaction not created");
});

Then(/^The first account has paid for the transaction fee$/, async function () {
    assert.ok(currentTransferTransaction.transactionId, "Transaction ID not found");
    const record = await new TransactionRecordQuery()
        .setTransactionId(currentTransferTransaction.transactionId!)
        .execute(client);

    const payerAccountId = record.transactionId.accountId;
    assert.ok(payerAccountId, "Payer account ID not found");
    assert.strictEqual(payerAccountId.toString(), accounts[1].id);
});


When(/^A first hedera account with more than (\d+) hbar and (\d+) HTT tokens$/, { timeout: 30000 }, async function (hbars: number, tokens: number) {
    await moveExcessHbarsAndHTTToTreasureAccount(1, hbars, tokens);
});

When(/^A second Hedera account with (\d+) hbar and (\d+) HTT tokens$/, { timeout: 30000 }, async function (hbars: number, tokens: number) {
    await moveExcessHbarsAndHTTToTreasureAccountAndAssert(2, hbars, tokens);
});

When(/^A third Hedera account with (\d+) hbar and (\d+) HTT tokens$/, { timeout: 30000 }, async function (hbars: number, tokens: number) {
    await associateTokenWithAccountAsNeeded(tokenId, 3);
    await moveExcessHbarsAndHTTToTreasureAccountAndAssert(3, hbars, tokens);
});

When(/^A fourth Hedera account with (\d+) hbar and (\d+) HTT tokens$/, { timeout: 30000 }, async function (hbars: number, tokens: number) {
    await associateTokenWithAccountAsNeeded(tokenId, 4);
    await moveExcessHbarsAndHTTToTreasureAccountAndAssert(4, hbars, tokens);
});


When(
    /^A transaction is created to transfer (\d+) HTT tokens out of the first and second account and (\d+) HTT tokens into the third account and (\d+) HTT tokens into the fourth account$/,
    { timeout: 30000 },
    async function (
        amountToBeDeducted: number,
        thirdAccountAmount: number,
        fourthAccountAmount: number
    ): Promise<void> {
        await setTestAccountAsClientOperator(1);
        currentTransferTransaction = new TransferTransaction()
            .addTokenTransfer(tokenId, accounts[1].id, -amountToBeDeducted)
            .addTokenTransfer(tokenId, accounts[2].id, -amountToBeDeducted)
            .addTokenTransfer(tokenId, accounts[3].id, thirdAccountAmount)
            .addTokenTransfer(tokenId, accounts[4].id, fourthAccountAmount)
            .freezeWith(client);

        await currentTransferTransaction.sign(getPrivateKeyFromAccount(2));
        assert.ok(currentTransferTransaction, "Transfer transaction not created.");
    }
);


//utils
async function getTokenInfo(tokenId: TokenId): Promise<TokenInfo> {
    return await new TokenInfoQuery()
        .setTokenId(tokenId)
        .execute(client);
}

async function getTokenBalance(accountId: string, tokenId: TokenId): Promise<number> {
    const query = await new AccountBalanceQuery()
        .setAccountId(accountId)
        .execute(client);
    return query.tokens?.get(tokenId.toString())?.toNumber() || 0;
}

async function associateTokenWithAccountAsNeeded(tokenId: TokenId, accountIndex: number) {
    if (!(await checkTokenAssociation(accounts[accountIndex].id, tokenId.toString()))) {
        await associateTokenWithTestAccount(accountIndex, tokenId);
    }
}

async function associateTokenWithTestAccount(index: number, tokenId: TokenId): Promise<TransactionReceipt> {
    setTestAccountAsClientOperator(index);
    const associateTx = await new TokenAssociateTransaction()
        .setAccountId(accounts[index].id)
        .setTokenIds([tokenId])
        .freezeWith(client)
        .sign(getPrivateKeyFromAccount(index));
    const associateTxResponse = await associateTx.execute(client);
    const receipt = await associateTxResponse.getReceipt(client);
    return receipt;
}

async function checkTokenAssociation(accountId: string, tokenId: string): Promise<boolean> {
    const accountInfo = await new AccountInfoQuery()
        .setAccountId(accountId)
        .execute(client);

    const targetTokenId = TokenId.fromString(tokenId);
    const isAssociated = Array.from(accountInfo.tokenRelationships.keys())
        .some(tokenId => tokenId.toString() === targetTokenId.toString());
    return isAssociated;
}

function createTokenTransferTransaction(tokenId: TokenId, fromAccountId: string, toAccountId: string, amount: number): TransferTransaction {
    return new TransferTransaction()
        .addTokenTransfer(tokenId, fromAccountId, -amount)
        .addTokenTransfer(tokenId, toAccountId, amount)
}

function createTokenTransferTransactionAndFreeze(tokenId: TokenId, fromAccountId: string, toAccountId: string, amount: number): TransferTransaction {
    return createTokenTransferTransaction(tokenId, fromAccountId, toAccountId, amount)
        .freezeWith(client);
}

async function transferTokensToTestAccount(transferTransaction: TransferTransaction, privateKey: PrivateKey): Promise<TransactionReceipt> {
    const signedTx = await transferTransaction.sign(privateKey);
    const transferTxResponse = await signedTx.execute(client);
    const receipt = await transferTxResponse.getReceipt(client);
    return receipt;
}

async function transferTokens(tokenId: TokenId, fromAccountIndex: number, toAccountIndex: number, amount: number) {
    await setTestAccountAsClientOperator(fromAccountIndex);
    currentTransferTransaction = createTokenTransferTransactionAndFreeze(tokenId, accounts[fromAccountIndex].id, accounts[toAccountIndex].id, amount);
    await transferTokensToTestAccount(currentTransferTransaction, getPrivateKeyFromAccount(fromAccountIndex));
}

//Logic to move hbars and tokens for test scenarios. 
async function moveExcessHbarsAndHTTToTreasureAccount(fromAccountIndex: number, hbarAllowed: number, tokenAllowed: number) {
    await setTestAccountAsClientOperator(fromAccountIndex);
    
    await transferExcessHbars(fromAccountIndex, 0, new Hbar(hbarAllowed).toTinybars());

    await transferTokensWithExpectedAmount(tokenId, 0, fromAccountIndex, tokenAllowed);
    await associateTokenWithAccountAsNeeded(tokenId, fromAccountIndex);
}

async function moveExcessHbarsAndHTTToTreasureAccountAndAssert(fromAccountIndex: number, hbarAllowed: number, tokenAllowed: number) {
    await moveExcessHbarsAndHTTToTreasureAccount(fromAccountIndex, hbarAllowed, tokenAllowed);
    const hBarBalance = (await checkAccountBalanceForTestAccount(fromAccountIndex)).hbars;
    const tokenBalance = await getTokenBalance(accounts[fromAccountIndex].id, tokenId);
    assert.ok(hbarAllowed >= hBarBalance.toBigNumber().toNumber() || hBarBalance.toBigNumber().toNumber() <= MINIMUM_FEE_RESERVE, `Account ${accounts[fromAccountIndex].id} should have more than ${hbarAllowed} hbars`);
    assert.strictEqual(tokenBalance, tokenAllowed, `Account ${accounts[fromAccountIndex].id} should have ${tokenAllowed} tokens`);
}

async function transferTokensWithExpectedAmount(tokenId: TokenId, account1Index: number, account2Index: number, amount: number) {
    let balance = await getTokenBalance(accounts[account2Index].id, tokenId);
    if (balance < amount) {
        await transferTokens(tokenId, account1Index, account2Index, amount - balance);
    } else if (balance > amount) {
        await transferTokens(tokenId, account2Index, account1Index, balance - amount);
    }
}

async function transferExcessHbars(fromAccountIndex: number, toAccountIndex: number, minimumBalanceTinybars: Long): Promise<void> {

    const effectiveMinimum = minimumBalanceTinybars.add(MINIMUM_FEE_RESERVE);

    const hBarBalance = (await checkAccountBalanceForTestAccount(fromAccountIndex)).hbars.toTinybars();

    if (hBarBalance.gt(effectiveMinimum)) {
        const amountToTransfer = hBarBalance.subtract(effectiveMinimum);

        if (amountToTransfer.gt(0)) {
            await transferHbars(
                accounts[fromAccountIndex].id,
                accounts[toAccountIndex].id,
                Hbar.fromTinybars(amountToTransfer).toBigNumber().toNumber()
            );
        }
    }
}


