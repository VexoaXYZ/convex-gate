import { v } from "convex/values";

export const whereClauseValidator = v.object({
  field: v.string(),
  operator: v.optional(
    v.union(
      v.literal("lt"),
      v.literal("lte"),
      v.literal("gt"),
      v.literal("gte"),
      v.literal("eq"),
      v.literal("in"),
      v.literal("not_in"),
      v.literal("ne"),
      v.literal("contains"),
      v.literal("starts_with"),
      v.literal("ends_with")
    )
  ),
  value: v.any(),
  connector: v.optional(v.union(v.literal("AND"), v.literal("OR"))),
});

export const sortByValidator = v.object({
  field: v.string(),
  direction: v.union(v.literal("asc"), v.literal("desc")),
});

export const getSessionWithUserByTokenArgsValidator = v.object({
  token: v.string(),
  now: v.number(),
});

export const getSessionWithUserBySessionIdArgsValidator = v.object({
  sessionId: v.string(),
  now: v.number(),
});

export const invalidateSessionArgsValidator = v.object({
  sessionId: v.string(),
});

export const invalidateUserSessionsArgsValidator = v.object({
  userId: v.string(),
});

export const crudCreateArgsValidator = v.object({
  model: v.string(),
  data: v.any(),
});

export const crudFindOneArgsValidator = v.object({
  model: v.string(),
  where: v.array(whereClauseValidator),
});

export const crudFindManyArgsValidator = v.object({
  model: v.string(),
  where: v.array(whereClauseValidator),
  limit: v.number(),
  offset: v.optional(v.number()),
  sortBy: v.optional(sortByValidator),
});

export const crudCountArgsValidator = v.object({
  model: v.string(),
  where: v.array(whereClauseValidator),
});

export const crudUpdateOneArgsValidator = v.object({
  model: v.string(),
  where: v.array(whereClauseValidator),
  update: v.any(),
});

export const crudUpdateManyArgsValidator = v.object({
  model: v.string(),
  where: v.array(whereClauseValidator),
  update: v.any(),
});

export const crudDeleteOneArgsValidator = v.object({
  model: v.string(),
  where: v.array(whereClauseValidator),
});

export const crudDeleteManyArgsValidator = v.object({
  model: v.string(),
  where: v.array(whereClauseValidator),
});
