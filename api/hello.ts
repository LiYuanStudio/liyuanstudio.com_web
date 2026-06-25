export default function handler(req: any, res: any) {
  res.statusCode = 200;
  res.setHeader('Content-Type', 'text/plain');
  res.end('hello');
}
