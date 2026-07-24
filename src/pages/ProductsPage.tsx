import { CollageCard, CollageGrid, ContentHubLayout } from '../components/ContentHub.js';
import { PRODUCTS } from '../data/products.js';

export function ProductsPage() {
  return (
    <ContentHubLayout
      current="products"
      title="产品"
      description="从桌面应用到开源核心与命令行工具，探索 LiYuan Studio 构建的创作工具。"
    >
      <CollageGrid>
        {PRODUCTS.map((product) => (
          <CollageCard
            key={product.name}
            href={product.href}
            title={product.name}
            eyebrow={product.eyebrow}
            description={product.description}
            meta={product.actionLabel}
            tone={product.tone}
            external={product.linkKind === 'external'}
            ariaLabel={`${product.actionLabel}：${product.name}`}
          />
        ))}
      </CollageGrid>
    </ContentHubLayout>
  );
}
