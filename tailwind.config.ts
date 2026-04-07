import type { Config } from "tailwindcss";

export default {
	darkMode: ["class"],
	content: [
		"./pages/**/*.{ts,tsx}",
		"./components/**/*.{ts,tsx}",
		"./app/**/*.{ts,tsx}",
		"./src/**/*.{ts,tsx}",
	],
	prefix: "",
	theme: {
		container: {
			center: true,
			padding: '2rem',
			screens: {
				'2xl': '1400px'
			}
		},
		extend: {
			colors: {
				border: 'hsl(var(--border))',
				input: 'hsl(var(--input))',
				ring: 'hsl(var(--ring))',
				background: 'hsl(var(--background))',
				foreground: 'hsl(var(--foreground))',
				glass: {
					DEFAULT: 'hsl(var(--glass))',
					border: 'hsl(var(--glass-border))',
					glow: 'hsl(var(--glass-glow))',
					overlay: 'hsl(var(--glass-overlay))'
				},
				primary: {
					DEFAULT: 'hsl(var(--primary))',
					foreground: 'hsl(var(--primary-foreground))',
					glow: 'hsl(var(--primary-glow))'
				},
				secondary: {
					DEFAULT: 'hsl(var(--secondary))',
					foreground: 'hsl(var(--secondary-foreground))'
				},
				destructive: {
					DEFAULT: 'hsl(var(--destructive))',
					foreground: 'hsl(var(--destructive-foreground))'
				},
				success: {
					DEFAULT: 'hsl(var(--success))',
					foreground: 'hsl(var(--success-foreground))'
				},
				muted: {
					DEFAULT: 'hsl(var(--muted))',
					foreground: 'hsl(var(--muted-foreground))'
				},
				accent: {
					DEFAULT: 'hsl(var(--accent))',
					foreground: 'hsl(var(--accent-foreground))'
				},
				'user-message': {
					DEFAULT: 'hsl(var(--user-message-bg))',
					border: 'hsl(var(--user-message-border))'
				},
				'ai-message': {
					DEFAULT: 'hsl(var(--ai-message-bg))',
					border: 'hsl(var(--ai-message-border))'
				}
			},
			backdropBlur: {
				xs: '2px',
				sm: '4px',
				md: '8px',
				lg: '16px',
				xl: '24px'
			},
			borderRadius: {
				lg: 'var(--radius)',
				md: 'calc(var(--radius) - 2px)',
				sm: 'calc(var(--radius) - 4px)'
			},
			keyframes: {
				'accordion-down': {
					from: {
						height: '0',
						opacity: '0'
					},
					to: {
						height: 'var(--radix-accordion-content-height)',
						opacity: '1'
					}
				},
				'accordion-up': {
					from: {
						height: 'var(--radix-accordion-content-height)',
						opacity: '1'
					},
					to: {
						height: '0',
						opacity: '0'
					}
				},
				'bounce-in': {
					'0%': {
						transform: 'scale(0.3)',
						opacity: '0'
					},
					'50%': {
						transform: 'scale(1.05)'
					},
					'70%': {
						transform: 'scale(0.9)'
					},
					'100%': {
						transform: 'scale(1)',
						opacity: '1'
					}
				},
				'rubber-band': {
					'0%': {
						transform: 'scale3d(1, 1, 1)'
					},
					'30%': {
						transform: 'scale3d(1.25, 0.75, 1)'
					},
					'40%': {
						transform: 'scale3d(0.75, 1.25, 1)'
					},
					'50%': {
						transform: 'scale3d(1.15, 0.85, 1)'
					},
					'65%': {
						transform: 'scale3d(0.95, 1.05, 1)'
					},
					'75%': {
						transform: 'scale3d(1.05, 0.95, 1)'
					},
					'100%': {
						transform: 'scale3d(1, 1, 1)'
					}
				},
				'spring-in': {
					'0%': {
						transform: 'scale(0) rotate(180deg)',
						opacity: '0'
					},
					'80%': {
						transform: 'scale(1.1) rotate(-10deg)',
						opacity: '1'
					},
					'100%': {
						transform: 'scale(1) rotate(0deg)',
						opacity: '1'
					}
				},
			'wiggle': {
					'0%, 100%': { transform: 'rotate(-3deg)' },
					'50%': { transform: 'rotate(3deg)' }
				},
				'pop-in': {
					'0%': { transform: 'scale(0.5)', opacity: '0' },
					'70%': { transform: 'scale(1.08)', opacity: '1' },
					'100%': { transform: 'scale(1)', opacity: '1' }
				},
				'slide-up-bounce': {
					'0%': { transform: 'translateY(20px) scale(0.95)', opacity: '0' },
					'60%': { transform: 'translateY(-4px) scale(1.02)', opacity: '1' },
					'100%': { transform: 'translateY(0) scale(1)', opacity: '1' }
				},
				'jelly': {
					'0%': { transform: 'scale(1, 1)' },
					'25%': { transform: 'scale(0.95, 1.05)' },
					'50%': { transform: 'scale(1.05, 0.95)' },
					'75%': { transform: 'scale(0.98, 1.02)' },
					'100%': { transform: 'scale(1, 1)' }
				},
				'float': {
					'0%, 100%': { transform: 'translateY(0)' },
					'50%': { transform: 'translateY(-6px)' }
				}
			},
			animation: {
				'accordion-down': 'accordion-down 0.3s cubic-bezier(0.87, 0, 0.13, 1)',
				'accordion-up': 'accordion-up 0.3s cubic-bezier(0.87, 0, 0.13, 1)',
				'bounce-in': 'bounce-in 0.5s cubic-bezier(0.68, -0.55, 0.265, 1.55)',
				'rubber-band': 'rubber-band 0.7s cubic-bezier(0.25, 0.46, 0.45, 0.94)',
				'spring-in': 'spring-in 0.45s cubic-bezier(0.175, 0.885, 0.32, 1.275)',
				'wiggle': 'wiggle 0.4s ease-in-out',
				'pop-in': 'pop-in 0.35s cubic-bezier(0.175, 0.885, 0.32, 1.275)',
				'slide-up-bounce': 'slide-up-bounce 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275)',
				'jelly': 'jelly 0.5s cubic-bezier(0.25, 0.46, 0.45, 0.94)',
				'float': 'float 3s ease-in-out infinite'
			}
		}
	},
	plugins: [require("tailwindcss-animate")],
} satisfies Config;
