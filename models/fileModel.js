
import mongoose, { Schema } from "mongoose";
import { number } from "zod";


const fileSchema = new Schema({
    name: {
        type: String,
        required: true
    },
    size: {
        type: Number,
        required: true
    },
    extension: {
        type: String,
        required: true
    },
    userId: {
        type: Schema.Types.ObjectId,
        required: true
    },
    parentDirId: {
        type: Schema.Types.ObjectId,
        required: true
    }
}, { strict: 'throw', timestamps: true })



const File = mongoose.model('File', fileSchema)
export default File