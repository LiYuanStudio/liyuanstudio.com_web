import mongoose from 'mongoose';

export interface BlogPost {
  title: string;
  excerpt: string;
  category: string;
  date: string;
  readTime: string;
  image?: string;
  slug: string;
  content?: string;
}

const BlogSchema = new mongoose.Schema<BlogPost>(
  {
    title: { type: String, required: true },
    excerpt: { type: String, required: true },
    category: { type: String, required: true },
    date: { type: String, required: true },
    readTime: { type: String, required: true },
    image: { type: String },
    slug: { type: String, required: true, unique: true },
    content: { type: String },
  },
  { timestamps: true },
);

export const BlogModel =
  (mongoose.models.Blog as mongoose.Model<BlogPost>) ||
  mongoose.model<BlogPost>('Blog', BlogSchema);
