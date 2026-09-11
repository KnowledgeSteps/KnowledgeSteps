import { CheckCircleOutlined, CheckOutlined, QuestionCircleOutlined, MinusCircleOutlined } from '@ant-design/icons'
import type { AnswerValue, QuestionOption } from '../api/types'

export const ANSWER_OPTIONS: QuestionOption[] = [
  { value: 'VERY_FAMILIAR', label: '非常了解' },
  { value: 'BASICALLY_KNOW', label: '基本了解' },
  { value: 'HEARD_OF', label: '听说过' },
  { value: 'DONT_KNOW', label: '不了解' },
]

export const OPTION_ICON = {
  VERY_FAMILIAR: CheckCircleOutlined,
  BASICALLY_KNOW: CheckOutlined,
  HEARD_OF: QuestionCircleOutlined,
  DONT_KNOW: MinusCircleOutlined,
} satisfies Record<AnswerValue, typeof CheckOutlined>

export function answerLabel(value: AnswerValue | null): string {
  return ANSWER_OPTIONS.find((o) => o.value === value)?.label ?? '未作答'
}
