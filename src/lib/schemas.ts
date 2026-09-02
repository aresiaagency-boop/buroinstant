import { z } from "zod";

export const inboundMessageSchema = z.object({
  channel: z.enum(["WEB", "WHATSAPP"]),
  inputType: z.enum(["TEXT", "VOICE", "IMAGE", "DOCUMENT"]),
  userId: z.string().uuid().optional(),
  workspaceId: z.string().uuid().optional(),
  projectId: z.string().uuid().optional(),
  externalIdentity: z
    .object({
      provider: z.literal("EVOLUTION_API"),
      instance: z.string().min(1).max(120),
      phone: z.string().min(7).max(20),
      messageId: z.string().min(1).max(250),
    })
    .optional(),
  text: z.string().trim().min(1).max(12_000),
  sourceTimestamp: z.iso.datetime(),
});

export const whatsappWebhookSchema = z.object({
  provider: z.literal("EVOLUTION_API"),
  event: z.literal("messages.upsert"),
  instance: z.string().min(1).max(120),
  messageId: z.string().min(1).max(250),
  phone: z.string().min(7).max(30),
  pushName: z.string().max(160).optional(),
  type: z.enum(["text", "voice"]),
  text: z.string().trim().min(1).max(12_000),
  timestamp: z.iso.datetime(),
});

export const agentChatSchema = z.object({
  projectId: z.string().uuid().optional(),
  text: z.string().trim().min(2).max(5_000),
  inputType: z.enum(["TEXT", "VOICE"]).default("TEXT"),
});

export const projectCreateSchema = z.object({
  name: z.string().trim().min(2).max(160),
  businessDescription: z.string().trim().min(10).max(3_000),
  preferredLanguage: z.enum(["es", "en"]).default("es"),
});

export const assessmentInputSchema = z.object({
  founders: z.number().int().min(1).max(100).optional(),
  activities: z.array(z.string().min(2).max(500)).max(20).default([]),
  expectedRevenue: z.number().nonnegative().optional(),
  liabilityExposure: z.enum(["LOW", "MEDIUM", "HIGH"]).optional(),
  hiringPlan: z.boolean().optional(),
  premises: z.boolean().optional(),
  internationalOperations: z.boolean().optional(),
  ecommerce: z.boolean().optional(),
  regulatedActivity: z.boolean().optional(),
  capital: z.number().nonnegative().optional(),
  administrator: z.string().max(160).optional(),
  ownership: z.array(z.number().min(0).max(100)).max(100).optional(),
  growthIntent: z.enum(["LOCAL", "NATIONAL", "INTERNATIONAL"]).optional(),
});
