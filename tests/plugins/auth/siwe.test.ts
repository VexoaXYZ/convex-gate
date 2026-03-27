import { describe, expect, it } from "vitest";
import { setup, createTestUser, createTestSession } from "../../helpers/mock-db.js";

describe("plugin: siwe (Sign In With Ethereum)", () => {
  it("creates user with wallet-related fields", async () => {
    const { api } = setup();
    const user = await createTestUser(api, {
      id: "siwe-user-1",
      email: null,
      emailVerified: false,
      name: "0xd8dA...6045",
      walletAddress: "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045",
    });

    expect(user.walletAddress).toBe("0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045");
    expect(user.email).toBeNull();
  });

  it("stores Ethereum address in account with providerId='ethereum'", async () => {
    const { api } = setup();
    const user = await createTestUser(api, {
      id: "siwe-acct-user",
      name: "Ethereum User",
    });

    const ethAddress = "0x742d35Cc6634C0532925a3b844Bc9e7595f2bD28";

    const account = await api.crud.create("account", {
      id: "siwe-acct-1",
      userId: user.id,
      accountId: ethAddress.toLowerCase(),
      providerId: "ethereum",
      chainId: "1",
      address: ethAddress,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    expect(account.providerId).toBe("ethereum");
    expect(account.accountId).toBe(ethAddress.toLowerCase());
    expect(account.address).toBe(ethAddress);
    expect(account.chainId).toBe("1");
  });

  it("multiple wallets per user", async () => {
    const { api } = setup();
    const user = await createTestUser(api, { id: "siwe-multi-user" });

    const wallets = [
      {
        id: "siwe-wallet-1",
        address: "0xAb5801a7D398351b8bE11C439e05C5B3259aeC9B",
        chainId: "1",
      },
      {
        id: "siwe-wallet-2",
        address: "0x1234567890AbcdEF1234567890aBcdef12345678",
        chainId: "1",
      },
      {
        id: "siwe-wallet-3",
        address: "0xDeaDBeefDeAdBeeFdeadBEEFDeADBEEFdeadBEEF",
        chainId: "137", // Polygon
      },
    ];

    for (const wallet of wallets) {
      await api.crud.create("account", {
        id: wallet.id,
        userId: user.id,
        accountId: wallet.address.toLowerCase(),
        providerId: "ethereum",
        address: wallet.address,
        chainId: wallet.chainId,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
    }

    const accounts = await api.crud.findMany(
      "account",
      [
        { field: "userId", value: "siwe-multi-user" },
        { field: "providerId", value: "ethereum" },
      ],
      { limit: 100 },
    );
    expect(accounts).toHaveLength(3);

    const addresses = accounts.map((a) => a.address);
    expect(addresses).toContain("0xAb5801a7D398351b8bE11C439e05C5B3259aeC9B");
    expect(addresses).toContain("0x1234567890AbcdEF1234567890aBcdef12345678");
    expect(addresses).toContain("0xDeaDBeefDeAdBeeFdeadBEEFDeADBEEFdeadBEEF");
  });

  it("wallet address lookup", async () => {
    const { api } = setup();
    const userA = await createTestUser(api, { id: "siwe-lookup-a", email: "a@eth.com" });
    const userB = await createTestUser(api, { id: "siwe-lookup-b", email: "b@eth.com" });

    const addressA = "0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";
    const addressB = "0xBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB";

    await api.crud.create("account", {
      id: "siwe-lookup-acct-a",
      userId: userA.id,
      accountId: addressA.toLowerCase(),
      providerId: "ethereum",
      address: addressA,
      chainId: "1",
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
    await api.crud.create("account", {
      id: "siwe-lookup-acct-b",
      userId: userB.id,
      accountId: addressB.toLowerCase(),
      providerId: "ethereum",
      address: addressB,
      chainId: "1",
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    // Look up by accountId (lowercased address)
    const foundA = await api.crud.findOne("account", [
      { field: "providerId", value: "ethereum" },
      { field: "accountId", value: addressA.toLowerCase() },
    ]);
    expect(foundA).not.toBeNull();
    expect(foundA!.userId).toBe("siwe-lookup-a");

    const foundB = await api.crud.findOne("account", [
      { field: "providerId", value: "ethereum" },
      { field: "accountId", value: addressB.toLowerCase() },
    ]);
    expect(foundB).not.toBeNull();
    expect(foundB!.userId).toBe("siwe-lookup-b");

    // Non-existent wallet returns null
    const notFound = await api.crud.findOne("account", [
      { field: "providerId", value: "ethereum" },
      { field: "accountId", value: "0xcccccccccccccccccccccccccccccccccccccccc" },
    ]);
    expect(notFound).toBeNull();
  });

  it("chain ID storage for multi-chain support", async () => {
    const { api } = setup();
    const user = await createTestUser(api, { id: "siwe-chain-user" });

    const chains = [
      { id: "siwe-chain-1", chainId: "1", name: "Ethereum Mainnet" },
      { id: "siwe-chain-137", chainId: "137", name: "Polygon" },
      { id: "siwe-chain-42161", chainId: "42161", name: "Arbitrum One" },
      { id: "siwe-chain-10", chainId: "10", name: "Optimism" },
    ];

    const address = "0xSameAddressAcrossChains000000000000000000";

    for (const chain of chains) {
      await api.crud.create("account", {
        id: chain.id,
        userId: user.id,
        accountId: `${address.toLowerCase()}:${chain.chainId}`,
        providerId: "ethereum",
        address,
        chainId: chain.chainId,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
    }

    const allChainAccounts = await api.crud.findMany(
      "account",
      [
        { field: "userId", value: "siwe-chain-user" },
        { field: "providerId", value: "ethereum" },
      ],
      { limit: 100 },
    );
    expect(allChainAccounts).toHaveLength(4);

    const chainIds = allChainAccounts.map((a) => a.chainId).sort();
    expect(chainIds).toEqual(["1", "10", "137", "42161"]);
  });

  it("SIWE user can create session and authenticate", async () => {
    const { api } = setup();
    const user = await createTestUser(api, {
      id: "siwe-session-user",
      email: null,
      name: "Ethereum Signer",
      walletAddress: "0xSIWESessionWallet00000000000000000000000",
    });

    await api.crud.create("account", {
      id: "siwe-session-acct",
      userId: user.id,
      accountId: "0xsiweSessionWallet00000000000000000000000",
      providerId: "ethereum",
      address: "0xSIWESessionWallet00000000000000000000000",
      chainId: "1",
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    const session = await createTestSession(api, user.id as string);

    const result = await api.hotPath.getSessionWithUserByToken({
      token: session.token as string,
      now: Date.now(),
    });
    expect(result.session).not.toBeNull();
    expect(result.user).not.toBeNull();
    expect(result.user!.walletAddress).toBe("0xSIWESessionWallet00000000000000000000000");
  });

  it("deletes ethereum account when wallet is unlinked", async () => {
    const { api } = setup();
    const user = await createTestUser(api, { id: "siwe-unlink-user" });
    const address = "0xUnlinkMe000000000000000000000000000000000";

    await api.crud.create("account", {
      id: "siwe-unlink-acct",
      userId: user.id,
      accountId: address.toLowerCase(),
      providerId: "ethereum",
      address,
      chainId: "1",
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    await api.crud.deleteOne({
      model: "account",
      where: [
        { field: "providerId", value: "ethereum" },
        { field: "accountId", value: address.toLowerCase() },
      ],
    });

    const found = await api.crud.findOne("account", [
      { field: "providerId", value: "ethereum" },
      { field: "accountId", value: address.toLowerCase() },
    ]);
    expect(found).toBeNull();
  });
});
