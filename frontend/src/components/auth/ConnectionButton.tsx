import { Button } from 'antd'
import type { ButtonProps } from 'antd'

// Interaction adapted from Uiverse.io / pharmacist-sabot / funny-gecko-48 (MIT).
export function ConnectionButton({ label, className = '', ...props }:
  ButtonProps & { label: string }) {
  return <Button htmlType="button" aria-label={label} {...props} className={`submit-btn ${className}`} data-text={label}>
    <span className="btn-text">{label}</span>
  </Button>
}
