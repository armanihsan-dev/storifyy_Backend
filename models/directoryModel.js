import mongoose, { Mongoose, Schema } from "mongoose";
import { ObjectId } from 'mongodb';

const directorySchema = new Schema({
    name: {
        type: String,
        required: true,
    },
    userId: {
        type: Schema.Types.ObjectId,
        ref: "User",
        required: true,
    },
    parentDirId: {
        type: Schema.Types.ObjectId,
        ref: "Directory",
        default: null,
    }
}, { strict: 'throw', timestamps: true });




const Directory = mongoose.model('Directory', directorySchema)
export default Directory