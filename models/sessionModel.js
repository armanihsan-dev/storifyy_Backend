import mongoose, { Schema } from 'mongoose'

const sessionSchema = new Schema({

    userId: {
        type: Schema.Types.ObjectId,
        required: true
    },
    createdAt: {
        type: Date,
        default: Date.now,
        expires: 3600 * 24 * 7// one weak hour
    }
}, {
    strict: 'throw'
})

const Session = mongoose.model('Session', sessionSchema)
export default Session