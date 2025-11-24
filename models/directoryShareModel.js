import mongoose from "mongoose";

const directoryShareSchema = new mongoose.Schema(
    {
        directoryId: {
            type: mongoose.Schema.Types.ObjectId,
            required: true,
            refPath: "itemType"
        },
        sharedUserId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
        },
        sharedUserEmail: {
            type: String,
            required: true,
        },
        accessType: {
            type: String,
            enum: ["viewer", "editor"],
            default: "viewer",
        },
        sharedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
        },
    },
    { timestamps: true }
);
const DirectoryShare = mongoose.model("DirectoryShare", directoryShareSchema);
export default DirectoryShare

