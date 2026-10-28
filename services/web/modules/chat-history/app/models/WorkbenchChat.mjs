import mongoose from '../../../../app/src/infrastructure/Mongoose.mjs'

const { Schema } = mongoose
const { ObjectId } = Schema

// One AI assistant chat of a user in a project, as the browser's UI messages
export const WorkbenchChatSchema = new Schema(
  {
    userId: { type: ObjectId, ref: 'User', required: true },
    projectId: { type: ObjectId, ref: 'Project', required: true },
    // The id the browser gave the chat
    chatId: { type: String, required: true },
    title: { type: String, default: '' },
    messages: { type: [Schema.Types.Mixed], default: [] },
    // The server's summary of the earlier turns: { summary, upToMessageId }
    summary: { type: Schema.Types.Mixed, default: null },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now },
  },
  { collection: 'workbenchChats', minimize: false }
)

WorkbenchChatSchema.index({ userId: 1, projectId: 1, chatId: 1 }, { unique: true })
WorkbenchChatSchema.index({ userId: 1, projectId: 1, updatedAt: -1 })
WorkbenchChatSchema.index({ projectId: 1 })

export const WorkbenchChat = mongoose.model('WorkbenchChat', WorkbenchChatSchema)
