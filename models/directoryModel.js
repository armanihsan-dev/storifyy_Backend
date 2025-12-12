import mongoose, { Mongoose, Schema } from "mongoose";
import { ObjectId } from 'mongodb';

const directorySchema = new Schema({
    name: {
        type: String,
        required: true,
    },
    size: {
        type: Number,
        required: true,
        default: 0
    },
    userId: {
        type: Schema.Types.ObjectId,
        ref: "User",
        required: true,
    },
    isStarred: {
        type: Boolean,
        default: false,
    },
    parentDirId: {
        type: Schema.Types.ObjectId,
        ref: "Directory",
        default: null,
    },
    path: [
        {
            type: Schema.Types.ObjectId,
            ref: "Directory",
        }
    ]
}, { strict: 'throw', timestamps: true });




const Directory = mongoose.model('Directory', directorySchema)
export default Directory