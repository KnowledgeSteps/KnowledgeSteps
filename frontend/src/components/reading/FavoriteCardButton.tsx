import { Button } from 'antd'
import { BookOutlined, LoadingOutlined, StarFilled, StarOutlined } from '@ant-design/icons'
import '../../design/knowledge-cards.css'

/** From Uiverse.io by Kaizen0000: capsule, border layer, sweep, divider and animated stars. */
export function FavoriteCardButton({ saved, loading, disabled, onClick }: { saved: boolean; loading: boolean; disabled: boolean; onClick: () => void }) {
  return <Button className={`favorite-card-button ${saved ? 'is-saved' : ''}`} disabled={disabled || loading}
    aria-label={saved ? '取消收藏' : '收藏卡片'} aria-pressed={saved} aria-busy={loading} onClick={onClick}>
    <span className="favorite-border" aria-hidden="true"><span /></span>
    <span className="favorite-surface" aria-hidden="true"><span className="favorite-sweep" /></span>
    <span className="favorite-leading" aria-hidden="true">{loading ? <LoadingOutlined spin /> : <BookOutlined />}</span>
    <span className="favorite-divider" aria-hidden="true" />
    <span className="favorite-label">{loading ? (saved ? '取消中' : '收藏中') : saved ? '取消收藏' : '收藏卡片'}</span>
    <span className="favorite-star" aria-hidden="true"><span className="favorite-ring" />
      {Array.from({ length: 6 }, (_, i) => <i key={i} className={`favorite-particle particle-${i}`} />)}
      <StarOutlined className="favorite-star-outline" /><StarFilled className="favorite-star-filled" />
    </span>
  </Button>
}
