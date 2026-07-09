import mongoose from 'mongoose';

export type BlogStatus = 'draft' | 'published';
export type BlogVisibility = 'public' | 'unlisted';

export interface BlogPost {
  title: string;
  excerpt?: string;
  category?: string;
  tags: string[];
  blogNumber?: number;
  slug: string;
  content: string;
  image?: string;
  readTime?: string;
  authorId: mongoose.Types.ObjectId;
  authorUsername: string;
  authorDisplayName: string;
  authorAvatar?: string;
  status: BlogStatus;
  visibility: BlogVisibility;
  publishedAt?: Date;
  createdAt?: Date;
  updatedAt?: Date;
}

const BlogSchema = new mongoose.Schema<BlogPost>(
  {
    title: { type: String, required: true, trim: true, minlength: 1, maxlength: 80 },
    excerpt: { type: String, trim: true, maxlength: 200, default: '' },
    category: { type: String, trim: true, maxlength: 32, default: '' },
    tags: {
      type: [String],
      default: [],
      validate: {
        validator(tags: string[]) {
          return tags.length <= 8 && tags.every((tag) => tag.length <= 20);
        },
        message: '标签最多 8 个，每个最多 20 个字符',
      },
    },
    blogNumber: { type: Number, min: 1, unique: true, sparse: true, index: true },
    slug: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      minlength: 2,
      maxlength: 64,
      match: /^[a-zA-Z0-9-]{2,64}$/,
    },
    content: { type: String, required: true, minlength: 1, maxlength: 100000 },
    image: { type: String, trim: true, maxlength: 500 },
    readTime: { type: String, trim: true, maxlength: 32 },
    authorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    authorUsername: { type: String, required: true, trim: true },
    authorDisplayName: { type: String, required: true, trim: true },
    authorAvatar: { type: String, trim: true },
    status: { type: String, enum: ['draft', 'published'], required: true, default: 'draft' },
    visibility: { type: String, enum: ['public', 'unlisted'], required: true, default: 'public' },
    publishedAt: { type: Date },
  },
  { timestamps: true },
);

BlogSchema.index({ authorUsername: 1, slug: 1 }, { unique: true });
BlogSchema.index({ authorId: 1, createdAt: -1 });
BlogSchema.index({ status: 1, publishedAt: -1 });

export const BlogModel =
  (mongoose.models.Blog as mongoose.Model<BlogPost>) ||
  mongoose.model<BlogPost>('Blog', BlogSchema);
