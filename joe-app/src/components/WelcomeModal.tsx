import { useEffect, useState } from 'react'
import { getDayOfYear } from 'date-fns'
import { X, Sparkles } from 'lucide-react'

const QUOTES: { text: string; author: string }[] = [
  { text: "La vida no se mide por los momentos en que respiras, sino por los que te dejan sin aliento.", author: "Maya Angelou" },
  { text: "No esperes el momento perfecto. Toma el momento y hazlo perfecto.", author: "Zoey Sayward" },
  { text: "El rock no es solo música, es una actitud ante la vida.", author: "Joan Jett" },
  { text: "Eres más valiente de lo que crees, más fuerte de lo que pareces y más inteligente de lo que piensas.", author: "A.A. Milne" },
  { text: "Las mujeres que se sienten perfectamente cómodas consigo mismas son las más aterradoras del mundo.", author: "Marilyn Monroe" },
  { text: "Una mujer que sabe lo que quiere ya lo tiene casi todo.", author: "Coco Chanel" },
  { text: "Haz lo que debas aunque no puedas evitar tener miedo.", author: "Rosa Parks" },
  { text: "Algunas mujeres temen el fuego, otras simplemente se convierten en él.", author: "R.H. Sin" },
  { text: "El mejor momento para plantar un árbol fue hace veinte años. El segundo mejor momento es ahora.", author: "Proverbio chino" },
  { text: "La música es el silencio entre las notas.", author: "Claude Debussy" },
  { text: "No te adaptes al entorno. Crea el tuyo.", author: "George Bernard Shaw" },
  { text: "Cuida tu cuerpo. Es el único lugar que tienes para vivir.", author: "Jim Rohn" },
  { text: "La diferencia entre quién eres y quién quieres ser está en lo que haces cada día.", author: "Anónimo" },
  { text: "El secreto de salir adelante es comenzar.", author: "Mark Twain" },
  { text: "No cuentes los días, haz que los días cuenten.", author: "Muhammad Ali" },
  { text: "La fuerza que necesitas ya está dentro de ti.", author: "Lao-Tse" },
  { text: "El universo no es castigador ni indulgente. Es simplemente consecuente.", author: "Neil deGrasse Tyson" },
  { text: "Ser poderosa es como ser una dama: si tienes que decírselo a la gente, no lo eres.", author: "Margaret Thatcher" },
  { text: "La música puede cambiar el mundo porque puede cambiar a las personas.", author: "Bono" },
  { text: "Nunca es demasiado tarde para ser lo que podrías haber sido.", author: "George Eliot" },
  { text: "Lo que niegas te somete. Lo que aceptas te transforma.", author: "Carl G. Jung" },
  { text: "Primero decide quién quieres ser, luego haz lo que tengas que hacer.", author: "Epicteto" },
  { text: "Cada día es una segunda oportunidad.", author: "Anónimo" },
  { text: "La astrología es un lenguaje. Si entiendes ese lenguaje, el cielo te habla.", author: "Dane Rudhyar" },
  { text: "Baila como si nadie te mirara. Ama como si nunca te hubieran herido.", author: "Mark Twain" },
  { text: "La energía que metes en el mundo regresa a ti.", author: "Oprah Winfrey" },
  { text: "No eres lo que te ha pasado. Eres lo que has elegido ser.", author: "Carl G. Jung" },
  { text: "Una mujer con ambición es imparable.", author: "Simone de Beauvoir" },
  { text: "El vino es la poesía embotellada.", author: "Robert Louis Stevenson" },
  { text: "Meditar es entenderte a ti mismo sin juzgarte.", author: "Osho" },
  { text: "Las estrellas no pueden brillar sin oscuridad.", author: "D.H. Sidebottom" },
  { text: "La vida es lo que sucede mientras estás ocupada haciendo otros planes.", author: "John Lennon" },
  { text: "Un buen médico trata la enfermedad. El gran médico trata al paciente que tiene la enfermedad.", author: "William Osler" },
  { text: "La disciplina es libertad.", author: "Jocko Willink" },
  { text: "Cuando todo parezca ir en tu contra, recuerda que el avión despega contra el viento.", author: "Henry Ford" },
  { text: "No hay camino al bienestar. El bienestar es el camino.", author: "Buda" },
  { text: "Eres el promedio de las cinco personas con las que más tiempo pasas. Elige bien.", author: "Jim Rohn" },
  { text: "El rock es una actitud, no un género.", author: "Eddie Van Halen" },
  { text: "Sé el cambio que quieres ver en el mundo.", author: "Mahatma Gandhi" },
  { text: "La paciencia es la forma más heroica del coraje.", author: "G.K. Chesterton" },
  { text: "Todo lo que puedes imaginar es real.", author: "Pablo Picasso" },
  { text: "No sigas el camino. Ve donde no hay camino y deja huella.", author: "Ralph Waldo Emerson" },
  { text: "Tienes lo que se necesita. Siempre lo has tenido.", author: "Anónimo" },
  { text: "La gratitud transforma lo que tenemos en suficiente.", author: "Aesop" },
  { text: "El cuerpo logra lo que la mente cree.", author: "Napoleon Hill" },
  { text: "Crea la vida que amas. Ama la vida que creas.", author: "Anónimo" },
  { text: "Incluso las estrellas necesitan oscuridad para brillar.", author: "Anónimo" },
  { text: "La enfermería es un arte y, si ha de ser hecho como arte, requiere una devoción tan exclusiva como la que un pintor o escultor da a su trabajo.", author: "Florence Nightingale" },
  { text: "La felicidad no es algo hecho. Proviene de tus propias acciones.", author: "Dalai Lama" },
  { text: "El éxito es ir de fracaso en fracaso sin perder el entusiasmo.", author: "Winston Churchill" },
  { text: "Cada día trae nuevas decisiones. Las de hoy forjan quien serás mañana.", author: "Anónimo" },
  { text: "La creatividad es la inteligencia divirtiéndose.", author: "Albert Einstein" },
  { text: "El placer del vino no está solo en beberlo, sino en aprender a escucharlo.", author: "Anónimo" },
  { text: "Respira. Esto también pasará.", author: "Anónimo" },
  { text: "Sé tan fuerte que nada pueda perturbar tu paz mental.", author: "Christian D. Larson" },
  { text: "La magia que buscas está en el trabajo que evitas.", author: "Anónimo" },
  { text: "Cuando dudes, no actúes. Cuando actúes, no dudes.", author: "Ambrose Bierce" },
  { text: "El silencio es también música.", author: "Robert Fripp" },
  { text: "Cuídate bien. Eres el activo más valioso que tendrás jamás.", author: "Jim Rohn" },
  { text: "La luna llena no le pide disculpas a nadie por brillar.", author: "Anónimo" },
  { text: "No esperes a que te salven. Sálvate tú.", author: "Anónimo" },
  { text: "El universo conspira a favor de quien sabe lo que quiere.", author: "Paulo Coelho" },
  { text: "Donde fluye la energía, crece la realidad.", author: "Rhonda Byrne" },
  { text: "La mejor versión de ti ya existe. Solo necesita que te atrevas a ser ella.", author: "Anónimo" },
]

function getDailyQuote() {
  const day = getDayOfYear(new Date())
  return QUOTES[day % QUOTES.length]
}

interface WelcomeModalProps {
  onClose: () => void
}

export default function WelcomeModal({ onClose }: WelcomeModalProps) {
  const [visible, setVisible] = useState(false)
  const quote = getDailyQuote()

  useEffect(() => {
    const t = setTimeout(() => setVisible(true), 80)
    return () => clearTimeout(t)
  }, [])

  function handleClose() {
    setVisible(false)
    setTimeout(onClose, 350)
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{
        background: 'radial-gradient(ellipse at center, #1a0e0533 0%, #0a0a0aee 100%)',
        backdropFilter: 'blur(6px)',
        opacity: visible ? 1 : 0,
        transition: 'opacity 0.35s ease',
      }}
      onClick={handleClose}
    >
      <div
        className="relative max-w-lg w-full"
        style={{
          transform: visible ? 'translateY(0) scale(1)' : 'translateY(24px) scale(0.96)',
          transition: 'transform 0.4s cubic-bezier(0.34, 1.56, 0.64, 1), opacity 0.35s ease',
          opacity: visible ? 1 : 0,
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Resplandor fondo */}
        <div
          className="absolute inset-0 rounded-3xl blur-2xl opacity-20 pointer-events-none"
          style={{ background: 'radial-gradient(ellipse, #c9a96e 0%, transparent 70%)' }}
        />

        {/* Tarjeta */}
        <div
          className="relative rounded-3xl overflow-hidden border border-[#c9a96e22]"
          style={{
            background: 'linear-gradient(145deg, #161616, #0e0e0e)',
            boxShadow: '0 0 60px #c9a96e18, 0 24px 64px #00000080',
          }}
        >
          {/* Línea dorada superior */}
          <div
            className="h-[2px] w-full"
            style={{ background: 'linear-gradient(90deg, transparent, #c9a96e, #722f37, #c9a96e, transparent)' }}
          />

          <div className="px-8 py-10">
            {/* Saludo */}
            <div className="flex items-center gap-2 mb-7">
              <Sparkles size={14} className="text-[#c9a96e]" />
              <span className="text-xs tracking-[0.25em] uppercase text-[#888] font-light">
                {getGreeting()}
              </span>
            </div>

            {/* Nombre */}
            <h1
              className="font-display text-5xl font-bold mb-8 leading-none"
              style={{
                background: 'linear-gradient(135deg, #e2c99a 0%, #c9a96e 40%, #9b7040 100%)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
              }}
            >
              Hola, Joe
            </h1>

            {/* Separador */}
            <div
              className="w-12 h-[1px] mb-8"
              style={{ background: 'linear-gradient(90deg, #c9a96e, transparent)' }}
            />

            {/* Frase del día */}
            <blockquote className="mb-3">
              <p
                className="font-display text-xl font-normal leading-relaxed italic"
                style={{ color: '#d4d4d4' }}
              >
                "{quote.text}"
              </p>
            </blockquote>
            <p className="text-sm text-[#666] tracking-wider">— {quote.author}</p>
          </div>

          {/* Footer */}
          <div
            className="px-8 py-4 flex items-center justify-between border-t border-[#1e1e1e]"
            style={{ background: '#0c0c0c' }}
          >
            <span className="text-xs text-[#444] tracking-widest uppercase">
              {new Date().toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' })}
            </span>
            <button
              onClick={handleClose}
              className="flex items-center gap-2 text-xs text-[#555] hover:text-[#c9a96e] transition-colors group"
            >
              <span>Entrar</span>
              <div className="w-5 h-5 rounded-full border border-[#333] flex items-center justify-center group-hover:border-[#c9a96e] transition-colors">
                <X size={10} />
              </div>
            </button>
          </div>

          {/* Línea dorada inferior */}
          <div
            className="h-[1px] w-full"
            style={{ background: 'linear-gradient(90deg, transparent, #722f3740, transparent)' }}
          />
        </div>
      </div>
    </div>
  )
}

function getGreeting() {
  const h = new Date().getHours()
  if (h < 6)  return 'Buenas noches'
  if (h < 13) return 'Buenos días'
  if (h < 21) return 'Buenas tardes'
  return 'Buenas noches'
}
