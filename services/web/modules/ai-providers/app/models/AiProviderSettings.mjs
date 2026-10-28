import mongoose from '../../../../app/src/infrastructure/Mongoose.mjs'

const { Schema } = mongoose

const ModelSchema = new Schema(
  {
    id: { type: String, required: true },
    // The name the gateway knows the model by, e.g. gpt-4o
    model: { type: String, required: true },
    label: { type: String, default: '' },
    // Offered to users in the chat's model menu
    selectable: { type: Boolean, default: false },
    // Reasoning efforts users can pick, sent as reasoning_effort; none when
    // the model has no such setting
    efforts: { type: [String], default: [] },
  },
  { _id: false }
)

const ProviderSchema = new Schema(
  {
    id: { type: String, required: true },
    name: { type: String, required: true },
    baseURL: { type: String, required: true },
    // encrypted with AI_PROVIDER_CIPHER_PASSWORD
    apiKey: { type: String, required: true },
    models: { type: [ModelSchema], default: [] },
  },
  { _id: false }
)

// One document: the AI gateways and models an admin set up. Without it the
// workbench uses the AI_* environment variables.
export const AiProviderSettingsSchema = new Schema(
  {
    enabled: { type: Boolean, default: false },
    providers: { type: [ProviderSchema], default: [] },
    // model ids for each use; null falls back to chat
    roles: {
      chat: { type: String, default: null },
      image: { type: String, default: null },
      pdf: { type: String, default: null },
      errorAssistant: { type: String, default: null },
    },
    updatedAt: { type: Date, default: Date.now },
  },
  { collection: 'aiProviderSettings', minimize: false }
)

export const AiProviderSettings = mongoose.model(
  'AiProviderSettings',
  AiProviderSettingsSchema
)
