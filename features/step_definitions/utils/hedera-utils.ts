import { AccountBalance, AccountBalanceQuery, AccountId, Client, PrivateKey, TokenAssociateTransaction, TokenId, TopicId, TopicInfo, TopicInfoQuery, TopicMessageQuery, TransactionReceipt, TransferTransaction } from "@hashgraph/sdk";
import { accounts } from "../../../src/config";

// Pre-configured client for test network (testnet)
export const client = Client.forTestnet()

// Setup the client for the given account id and private key
export function setupClient(accountId: string, privateKey: string) {
    const account: AccountId = AccountId.fromString(accountId);
    const privKey: PrivateKey = PrivateKey.fromStringED25519(privateKey);
    client.setOperator(account, privKey);
    return client;
}

export async function transferHbars(from: string, to: string, amount: number, customClient: Client = client): Promise<any> {
    // transfer hbars between accounts
    const transaction = await new TransferTransaction()
        .addHbarTransfer(from, -amount)
        .addHbarTransfer(to, amount)
        .execute(customClient);

    // Get the receipt of the transaction
    return await transaction.getReceipt(customClient);
}

export async function checkAccountBalanceForTestAccount(index: number): Promise<AccountBalance> {
    setTestAccountAsClientOperator(index)
    const query = new AccountBalanceQuery().setAccountId(accounts[index].id);
    const balance = await query.execute(client);
    return balance
};

export async function setTestAccountAsClientOperator(index: number) {
    const account = accounts[index];
    setupClient(account.id, account.privateKey);
}

export function getPrivateKeyFromAccount(index: number) {
    return PrivateKey.fromStringED25519(accounts[index].privateKey);
}