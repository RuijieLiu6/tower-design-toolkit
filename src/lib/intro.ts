// The intro (components/landing/Intro.tsx) is a screen of its own, not part of the landing page's scroll (Ruijie,
// 7 Nov: "for this front page experience you don't want to scroll back, or scroll down, so make sure the only way to
// bring users back to that experience is when users click on the icon of Tower Design Toolkit"). It shows when the app
// opens; entering (the button at the heart of the name) puts it away; the Tower Design Toolkit logo brings it back.
// Every other way to the start page (the guide's or the status page's back links) lands on the agent, past the intro.
import { create } from 'zustand'
import { navigate } from './route'

export const useIntro = create<{ show: boolean }>(() => ({ show: true }))

/** Past the intro, on to the agent. */
export const enterToolkit = () => useIntro.setState({ show: false })

/** The logo: back to the intro, from anywhere. */
export const showIntro = () => { useIntro.setState({ show: true }); navigate('start') }
