import { Routes, Route } from 'react-router-dom'
import Layout from './components/Layout'
import Dashboard from './pages/Dashboard'
import ModulePage from './components/ModulePage'
import { ALL_ITEMS } from './data/menu'

function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={<Dashboard />} />
        {ALL_ITEMS.filter((item) => item.id !== 'dashboard').map((item) => (
          <Route key={item.id} path={item.path} element={<ModulePage item={item} />} />
        ))}
      </Route>
    </Routes>
  )
}

export default App
