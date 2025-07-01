import { Given, Then, When } from "@cucumber/cucumber";
import {
  TopicCreateTransaction,
  TopicInfoQuery,
  TopicMessageQuery,
  TopicMessageSubmitTransaction,
  KeyList,
  TopicId,
  TopicInfo
} from "@hashgraph/sdk";
import { accounts } from "../../src/config";
import assert from "node:assert";
import { checkAccountBalanceForTestAccount, client, getPrivateKeyFromAccount, setTestAccountAsClientOperator, transferHbars } from "./utils/hedera-utils";
require('dotenv').config();


// Store the topic ID for message verification
let topicId: TopicId;
let receivedMessages: string[] = [];
let thresholdKeys: KeyList;

async function getTopicInfo(topicId: TopicId): Promise<TopicInfo> {
  return await new TopicInfoQuery().setTopicId(topicId).execute(client);
}

async function subscribeToTopic(topicId: TopicId): Promise<void> {
  new TopicMessageQuery()
    .setTopicId(topicId)
    .subscribe(client, null, (message) => {
      const receivedMessage = Buffer.from(message.contents).toString();
      receivedMessages.push(receivedMessage);
      console.log(`Received message: ${receivedMessage}`);
    });
  await new Promise((res) => setTimeout(res, 2000));
}

Given(/^a first account with more than (\d+) hbars$/, { timeout: 60000 }, async function (expectedBalance: number) {
  await setTestAccountAsClientOperator(0);

  if (!accounts || !accounts[1]) {
    throw new Error('Accounts not properly initialized');
  }

  await transferHbars(accounts[0].id, accounts[1].id, expectedBalance);

  const balance = await checkAccountBalanceForTestAccount(0);

  // Verify the account balance
  assert.ok(balance.hbars.toBigNumber().toNumber() > expectedBalance)
}
);

When(/^A topic is created with the memo "([^"]*)" with the first account as the submit key$/, { timeout: 60000 }, async function (memo: string) {
  try {
    await setTestAccountAsClientOperator(1)
    // Create a new topic with the memo and set the submit key to the first account
    const transaction = await new TopicCreateTransaction()
      .setTopicMemo(memo)
      .setSubmitKey(getPrivateKeyFromAccount(1).publicKey)
      .execute(client);

    // Get the receipt of the transaction
    const receipt = await transaction.getReceipt(client);

    // Get the new topic ID
    topicId = receipt.topicId!;
    this.topicId = topicId

    //get topic info
    const topicInfo = await getTopicInfo(topicId);

    assert.strictEqual(topicInfo.topicMemo, memo)
    assert(topicInfo.submitKey !== null && topicInfo.submitKey !== undefined);
    assert.equal(topicInfo.submitKey?.toString(), getPrivateKeyFromAccount(1).publicKey.toString())
  } catch (error) {
    console.error('Error creating topic:', error);
    throw error;
  }
});

When(/^The message "([^"]*)" is published to the topic$/, { timeout: 60000 }, async function (message: string) {
  try {
    await setTestAccountAsClientOperator(1)
    //subscribing to messages and pushing to received messages array.
    await subscribeToTopic(topicId);

    // Submit a message to the topic
    const sendResponse = await new TopicMessageSubmitTransaction()
      .setTopicId(topicId)
      .setMessage(message)
      .execute(client);

    // Get the receipt of the transaction
    const receipt = await sendResponse.getReceipt(client);

    assert.strictEqual(receipt.status._code, 22);
    assert.ok(receipt.topicSequenceNumber !== null, "Topic sequence number should be present");

  } catch (error) {
    console.error('Error publishing message:', error);
    throw error;
  }

});

Then(/^The message "([^"]*)" is received by the topic and can be printed to the console$/, async function (expectedMessage: string) {
  await new Promise((res) => setTimeout(res, 4000));
  assert.ok(receivedMessages.length > 0, `No messages received. Expecting at least one message.`)
  console.log(receivedMessages[receivedMessages.length - 1])
  assert.strictEqual(receivedMessages[receivedMessages.length - 1], expectedMessage);
});

Given(/^A second account with more than (\d+) hbars$/, async function (expectedBalance: number) {
  await setTestAccountAsClientOperator(0);

  if (!accounts || !accounts[2]) {
    throw new Error('Accounts not properly initialized');
  }

  await transferHbars(accounts[0].id, accounts[2].id, expectedBalance);

  const balance = await checkAccountBalanceForTestAccount(2);

  // Verify the account balance
  assert.ok(balance.hbars.toBigNumber().toNumber() > expectedBalance)
});

Given(/^A (\d+) of (\d+) threshold key with the first and second account$/, async function (threshold: number, total: number) {
  thresholdKeys = new KeyList([getPrivateKeyFromAccount(1).publicKey, getPrivateKeyFromAccount(2).publicKey], threshold)

  assert.equal(thresholdKeys._keys.length, total, "Threshold key list should have the correct number of keys")
  assert.equal(thresholdKeys._threshold, threshold, "Threshold key list should have the correct threshold")
});

When(/^A topic is created with the memo "([^"]*)" with the threshold key as the submit key$/, async function (memo: string) {
  try {
    await setTestAccountAsClientOperator(1)
    // Create a new topic with the memo and set the threshold key as submit key
    const transaction = await new TopicCreateTransaction()
      .setTopicMemo(memo)
      .setSubmitKey(thresholdKeys)
      .execute(client);

    // Get the receipt of the transaction
    const receipt = await transaction.getReceipt(client);

    // Get the new topic ID
    topicId = receipt.topicId!;
    this.topicId = topicId;

    //get topic info
    const topicInfo = await getTopicInfo(topicId);

    assert.strictEqual(topicInfo.topicMemo, memo)
    assert(topicInfo.submitKey !== null && topicInfo.submitKey !== undefined);
    assert.equal(topicInfo.submitKey?.toString(), thresholdKeys.toString())
  } catch (error) {
    console.error('Error creating topic with threshold key:', error);
    throw error;
  }
});