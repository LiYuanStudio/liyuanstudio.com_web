import mongoose from 'mongoose';

export interface NewsUpdate {
  title: string;
  description: string;
  content?: string;
  tag: string;
  date: string;
  image?: string;
  slug: string;
}

const NewsSchema = new mongoose.Schema<NewsUpdate>(
  {
    title: { type: String, required: true },
    description: { type: String, required: true },
    content: { type: String, maxlength: 100000 },
    tag: { type: String, required: true },
    date: { type: String, required: true },
    image: { type: String },
    slug: { type: String, required: true, unique: true },
  },
  { timestamps: true },
);

export const NewsModel =
  (mongoose.models.News as mongoose.Model<NewsUpdate>) ||
  mongoose.model<NewsUpdate>('News', NewsSchema);
