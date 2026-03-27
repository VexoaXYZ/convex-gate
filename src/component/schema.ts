import {
  defineSchema,
  defineTable,
  type DataModelFromSchemaDefinition,
  type DocumentByName,
} from "convex/server";
import { v } from "convex/values";

export const authTables = {
  user: defineTable({
    id: v.string(),
    name: v.optional(v.union(v.null(), v.string())),
    email: v.string(),
    emailVerified: v.boolean(),
    image: v.optional(v.union(v.null(), v.string())),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("id", ["id"])
    .index("email", ["email"])
    .index("createdAt", ["createdAt"]),
  session: defineTable({
    id: v.string(),
    userId: v.string(),
    token: v.string(),
    expiresAt: v.number(),
    ipAddress: v.optional(v.union(v.null(), v.string())),
    userAgent: v.optional(v.union(v.null(), v.string())),
    createdAt: v.optional(v.union(v.null(), v.number())),
    updatedAt: v.optional(v.union(v.null(), v.number())),
  })
    .index("id", ["id"])
    .index("token", ["token"])
    .index("userId", ["userId"])
    .index("expiresAt", ["expiresAt"])
    .index("userId_expiresAt", ["userId", "expiresAt"]),
  account: defineTable({
    id: v.string(),
    userId: v.string(),
    accountId: v.string(),
    providerId: v.string(),
    accessToken: v.optional(v.union(v.null(), v.string())),
    refreshToken: v.optional(v.union(v.null(), v.string())),
    idToken: v.optional(v.union(v.null(), v.string())),
    accessTokenExpiresAt: v.optional(v.union(v.null(), v.number())),
    refreshTokenExpiresAt: v.optional(v.union(v.null(), v.number())),
    scope: v.optional(v.union(v.null(), v.string())),
    password: v.optional(v.union(v.null(), v.string())),
    createdAt: v.optional(v.union(v.null(), v.number())),
    updatedAt: v.optional(v.union(v.null(), v.number())),
  })
    .index("id", ["id"])
    .index("userId", ["userId"])
    .index("accountId_providerId", ["accountId", "providerId"])
    .index("providerId_userId", ["providerId", "userId"]),
  verification: defineTable({
    id: v.string(),
    identifier: v.string(),
    value: v.string(),
    expiresAt: v.number(),
    createdAt: v.optional(v.union(v.null(), v.number())),
    updatedAt: v.optional(v.union(v.null(), v.number())),
  })
    .index("id", ["id"])
    .index("identifier", ["identifier"])
    .index("expiresAt", ["expiresAt"]),
  rateLimit: defineTable({
    key: v.string(),
    count: v.number(),
    lastRequest: v.number(),
  }).index("key", ["key"]),
  twoFactor: defineTable({
    userId: v.string(),
    secret: v.string(),
    backupCodes: v.string(),
  }).index("userId", ["userId"]),
  oauthApplication: defineTable({
    name: v.optional(v.union(v.null(), v.string())),
    icon: v.optional(v.union(v.null(), v.string())),
    metadata: v.optional(v.union(v.null(), v.string())),
    clientId: v.optional(v.union(v.null(), v.string())),
    clientSecret: v.optional(v.union(v.null(), v.string())),
    redirectUrls: v.optional(v.union(v.null(), v.string())),
    type: v.optional(v.union(v.null(), v.string())),
    disabled: v.optional(v.union(v.null(), v.boolean())),
    userId: v.optional(v.union(v.null(), v.string())),
    createdAt: v.optional(v.union(v.null(), v.number())),
    updatedAt: v.optional(v.union(v.null(), v.number())),
  })
    .index("clientId", ["clientId"])
    .index("userId", ["userId"]),
  oauthAccessToken: defineTable({
    accessToken: v.optional(v.union(v.null(), v.string())),
    refreshToken: v.optional(v.union(v.null(), v.string())),
    accessTokenExpiresAt: v.optional(v.union(v.null(), v.number())),
    refreshTokenExpiresAt: v.optional(v.union(v.null(), v.number())),
    clientId: v.optional(v.union(v.null(), v.string())),
    userId: v.optional(v.union(v.null(), v.string())),
    scopes: v.optional(v.union(v.null(), v.string())),
    createdAt: v.optional(v.union(v.null(), v.number())),
    updatedAt: v.optional(v.union(v.null(), v.number())),
  })
    .index("accessToken", ["accessToken"])
    .index("refreshToken", ["refreshToken"])
    .index("clientId", ["clientId"])
    .index("userId", ["userId"]),
  oauthConsent: defineTable({
    clientId: v.optional(v.union(v.null(), v.string())),
    userId: v.optional(v.union(v.null(), v.string())),
    scopes: v.optional(v.union(v.null(), v.string())),
    createdAt: v.optional(v.union(v.null(), v.number())),
    updatedAt: v.optional(v.union(v.null(), v.number())),
    consentGiven: v.optional(v.union(v.null(), v.boolean())),
  })
    .index("clientId_userId", ["clientId", "userId"])
    .index("userId", ["userId"]),
  jwks: defineTable({
    publicKey: v.string(),
    privateKey: v.string(),
    createdAt: v.number(),
    expiresAt: v.optional(v.union(v.null(), v.number())),
  }),
};

export const authSchema = defineSchema(authTables, {
  schemaValidation: false,
});

export type AuthDataModel = DataModelFromSchemaDefinition<typeof authSchema>;
export type AuthDocumentByName<
  TableName extends keyof AuthDataModel & string,
> = DocumentByName<AuthDataModel, TableName>;

export default authSchema;
