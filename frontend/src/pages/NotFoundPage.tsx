import { CardDecoration } from '../components/ui/CardDecoration';
import { InfoCircleOutlined } from '@ant-design/icons';
import { Button } from 'antd';
import { useNavigate } from 'react-router-dom';
export function NotFoundPage() {
    const navigate = useNavigate();
    return (<div className="uiverse-parent"><section className="fail-panel enter uiverse-card"><CardDecoration icon={<InfoCircleOutlined />}/><div className="uiverse-content">

      <span className="badge">404</span>
      <h1>这条寻路记录不存在</h1>
      <p>任务可能已过期，或当前账号无权查看它。</p>
      <div className="actions">
        <Button htmlType="button" type="primary" className="primary" onClick={() => navigate('/')}>
          回到首页重新寻路
        </Button>
      </div>
    </div></section></div>);
}
