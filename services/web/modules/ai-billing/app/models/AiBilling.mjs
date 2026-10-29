import mongoose from '../../../../app/src/infrastructure/Mongoose.mjs'

const { Schema } = mongoose
const { ObjectId } = Schema

// How a model of the ai-providers configuration is paid for
export const BILLING_TYPES = ['free_quota', 'metered', 'disabled']

const ModelBillingSchema = new Schema(
  {
    // The id of the model on the AI providers page
    modelId: { type: String, required: true },
    // free_quota: free uses each day, then the price; metered: the price
    billing: { type: String, enum: BILLING_TYPES, required: true },
    // See Pricing.mjs; null for none
    price: { type: Schema.Types.Mixed, default: null },
  },
  { _id: false }
)

// One document: whether AI use is paid for and what it costs. Without it
// billing is off.
export const AiBillingSettingsSchema = new Schema(
  {
    enabled: { type: Boolean, default: false },
    freeDailyUses: { type: Number, default: 20 },
    // Multiplies every price
    markup: { type: Number, default: 1 },
    usdToCny: { type: Number, default: 7.2 },
    // Beijing dates (YYYY-MM-DD) charged at off-peak rates, such as holidays
    offPeakDates: { type: [String], default: [] },
    // Where users buy redeem codes
    shopUrl: { type: String, default: '' },
    models: { type: [ModelBillingSchema], default: [] },
    updatedAt: { type: Date, default: Date.now },
  },
  { collection: 'aiBillingSettings', minimize: false }
)

// A user's balance, in millionths of a yuan, and VIP membership
export const AiAccountSchema = new Schema(
  {
    userId: { type: ObjectId, ref: 'User', required: true },
    balance: { type: Number, default: 0 },
    vipUntil: { type: Date, default: null },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now },
  },
  { collection: 'aiAccounts', minimize: false }
)
AiAccountSchema.index({ userId: 1 }, { unique: true })

// Every AI use and every change to a balance or membership
export const AiLedgerEntrySchema = new Schema(
  {
    userId: { type: ObjectId, ref: 'User', required: true },
    // usage, redeem or adjust (by an admin)
    type: { type: String, required: true },
    // Change to the balance in millionths of a yuan, negative for charges
    amount: { type: Number, default: 0 },
    // usage: free, vip, paid or unpriced; and what it was for
    mode: { type: String },
    feature: { type: String },
    modelId: { type: String },
    model: { type: String },
    projectId: { type: ObjectId },
    tokens: { type: Schema.Types.Mixed },
    // The dated rates, tier and period the charge used
    price: { type: Schema.Types.Mixed },
    // redeem and adjust: days of membership added, and the new end
    vipDays: { type: Number },
    vipUntil: { type: Date },
    codeId: { type: ObjectId },
    adminId: { type: ObjectId },
    note: { type: String },
    createdAt: { type: Date, default: Date.now },
  },
  { collection: 'aiLedger', minimize: false }
)
AiLedgerEntrySchema.index({ userId: 1, createdAt: -1 })

// A set of redeem codes an admin generated
export const AiRedeemBatchSchema = new Schema(
  {
    // vip_days: value days of membership; balance: value millionths of a yuan
    kind: { type: String, enum: ['vip_days', 'balance'], required: true },
    value: { type: Number, required: true },
    count: { type: Number, required: true },
    expiresAt: { type: Date, default: null },
    note: { type: String, default: '' },
    createdBy: { type: ObjectId, ref: 'User' },
    createdAt: { type: Date, default: Date.now },
  },
  { collection: 'aiRedeemBatches', minimize: false }
)
AiRedeemBatchSchema.index({ createdAt: -1 })

// One redeem code, kept as a hash of the code
export const AiRedeemCodeSchema = new Schema(
  {
    hash: { type: String, required: true },
    batchId: { type: ObjectId, required: true },
    kind: { type: String, required: true },
    value: { type: Number, required: true },
    expiresAt: { type: Date, default: null },
    // unused, used or void
    status: { type: String, default: 'unused' },
    usedBy: { type: ObjectId, ref: 'User', default: null },
    usedAt: { type: Date, default: null },
    createdAt: { type: Date, default: Date.now },
  },
  { collection: 'aiRedeemCodes', minimize: false }
)
AiRedeemCodeSchema.index({ hash: 1 }, { unique: true })
AiRedeemCodeSchema.index({ batchId: 1, status: 1 })

export const AiBillingSettings = mongoose.model('AiBillingSettings', AiBillingSettingsSchema)
export const AiAccount = mongoose.model('AiAccount', AiAccountSchema)
export const AiLedgerEntry = mongoose.model('AiLedgerEntry', AiLedgerEntrySchema)
export const AiRedeemBatch = mongoose.model('AiRedeemBatch', AiRedeemBatchSchema)
export const AiRedeemCode = mongoose.model('AiRedeemCode', AiRedeemCodeSchema)

export async function createIndexes() {
  await Promise.all([
    AiAccount.createIndexes(),
    AiLedgerEntry.createIndexes(),
    AiRedeemBatch.createIndexes(),
    AiRedeemCode.createIndexes(),
  ])
}
