import mongoose, { Schema } from 'mongoose'
import bcrypt from 'bcrypt'


const userSchema = new Schema({
    name: {
        type: String,
        required: true,
        minLength: [3, "Name must be a string with atleast 3 characters"]
    },
    email: {
        type: String,
        required: true,
        unique: true,
        match: [
            /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/,
            'Please add a valid email address.',
        ],
    },
    picture: {
        type: String,
        default: 'https://www.transparentpng.com/download/user/gray-user-profile-icon-png-fP8Q1P.png'
    },
    role: {
        type: String,
        enum: ['Admin', 'Manager', "User", "Owner"],
        default: 'User'
    },
    password: {
        type: String,
        minLength: 4
    },
    maxStorageInBytes: {
        type: Number,
        default: 500 * 1024 * 1024,
        required: true
    },
    maxUploadBytes: {
        type: Number,
        default: 100 * 1024 * 1024,
    },
    deleted: {
        type: Boolean,
        default: false
    },
    rootDirId: {
        type: Schema.Types.ObjectId,
        required: true
    }
}, {
    strict: 'throw', timestamps: true
})


userSchema.pre(/^find/, function (next) {
    // If the query explicitly asks for deleted users, skip the default filter
    if (this.getQuery().includeDeleted === true) {
        delete this.getQuery().includeDeleted; // remove flag
        return next();
    }
    // Otherwise only return non-deleted
    this.where({ deleted: { $ne: true } });
    next();
});


userSchema.methods.comparePassword = async function (condidatePassword) {
    return bcrypt.compare(condidatePassword, this.password)
}

const User = mongoose.model('User', userSchema)
export default User