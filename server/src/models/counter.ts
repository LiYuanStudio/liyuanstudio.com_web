import mongoose from 'mongoose';

export interface Counter {
  _id: string;
  seq: number;
}

const CounterSchema = new mongoose.Schema<Counter>({
  _id: { type: String, required: true },
  seq: { type: Number, required: true, default: 0 },
});

export const CounterModel =
  (mongoose.models.Counter as mongoose.Model<Counter>) ||
  mongoose.model<Counter>('Counter', CounterSchema);
