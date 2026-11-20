import Link from 'next/link';
import { authenticate } from '../actions';

type Params = Promise<{ error?: string; mode?: string }>;
export default async function SignIn({ searchParams }: { searchParams: Params }) {
  const { error, mode } = await searchParams;
  const signup = mode === 'signup';
  return <section className="narrow"><p className="eyebrow">YOUR TIME, YOUR WAY</p><h1>{signup ? 'Create your account' : 'Welcome back'}</h1><p>{signup ? 'Sign up to manage your bookings.' : 'Sign in to manage your bookings.'}</p>{error && <p className="notice error" role="alert">{error}</p>}<form action={authenticate} className="card form-stack"><input type="hidden" name="mode" value={signup ? 'signup' : 'signin'} />{signup && <label>Name<input name="name" autoComplete="name" required maxLength={100} /></label>}<label>Email<input name="email" type="email" autoComplete="email" required maxLength={254} /></label><label>Password<input name="password" type="password" autoComplete={signup ? 'new-password' : 'current-password'} required minLength={10} maxLength={72} /></label><button className="button" type="submit">{signup ? 'Create account' : 'Sign in'}</button><p>{signup ? 'Already have an account?' : 'New to SlotWise?'} <Link className="text-link" href={signup ? '/sign-in' : '/sign-in?mode=signup'}>{signup ? 'Sign in' : 'Create an account'}</Link></p></form></section>;
}
