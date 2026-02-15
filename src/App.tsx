import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { PortfolioComparisonView } from '@/components/views/PortfolioComparisonView';

function App() {
  return (
    <BrowserRouter>
      <div className="min-h-screen flex flex-col">
        <Routes>
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route path="/dashboard" element={<PortfolioComparisonView />} />
        </Routes>
      </div>
    </BrowserRouter>
  );
}

export default App;
