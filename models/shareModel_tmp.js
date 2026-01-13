import mongoose from "mongoose";

const shareSchema = new mongoose.Schema({
    fileId: { type: mongoose.Schema.Types.ObjectId, ref: 'File', required: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    email: { type: String },
    role: { type: String, enum: ['viewer', 'editor'], default: 'viewer' },
    sharedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    }
}, { timestamps: true });

const Share = mongoose.models.Share || mongoose.model("Share", shareSchema);
export default Share;
