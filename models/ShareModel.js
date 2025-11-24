import mongoose from "mongoose";

const shareSchema = new mongoose.Schema({
    fileId: { type: mongoose.Schema.Types.ObjectId, ref: 'File', required: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: false },
    email: { type: String },
    role: { type: String, enum: ['viewer', 'editor'], default: 'viewer' },
}, { timestamps: true });


const Share = mongoose.model("Share", shareSchema)
export default Share