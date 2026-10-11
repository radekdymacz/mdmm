#include "jittypes.h"

#ifdef HAVE_X86_64

#include "dsp56kBase/dspassert.h"

#include "jitops.h"
#include "dsp.h"
#include "asmjit/core/operand.h"

namespace dsp56k
{
	asmjit::x86::CondCode JitOps::reverseCC(const asmjit::x86::CondCode _cc)
	{
		return negateCond(_cc);
	}

	asmjit::x86::CondCode JitOps::decode_cccc(TWord cccc)
	{
		auto ccrMaskTest = [&](const CCRMask _mask)
		{
			m_ccrRead |= _mask;
			updateDirtyCCR(_mask);
			m_asm.test(m_dspRegs.getSR(JitDspRegs::Read).r32(), asmjit::Imm(_mask));
		};

		// ZF = ((N ^ V) | Z) == 0, for GT and LE (DSP::setAccuracyFixes). N is two bits above V and Z sits between
		// them: move N down to V's bit, keep only that bit, xor with SR (V's bit is now N ^ V, Z's bit is Z), test both.
		auto zOrNXorVTest = [&]()
		{
			static_assert(CCRB_N == CCRB_V + 2 && CCRB_Z == CCRB_V + 1);
			constexpr auto mask = static_cast<CCRMask>(CCR_Z | CCR_N | CCR_V);
			m_ccrRead |= mask;
			updateDirtyCCR(mask);
			const RegGP t(m_block);
			const auto sr = m_dspRegs.getSR(JitDspRegs::Read).r32();
			m_asm.mov(r32(t.get()), sr);
			m_asm.shr(r32(t.get()), asmjit::Imm(CCRB_N - CCRB_V));
			m_asm.and_(r32(t.get()), asmjit::Imm(CCR_V));
			m_asm.xor_(r32(t.get()), sr);
			m_asm.test(r32(t.get()), asmjit::Imm(CCR_V | CCR_Z));
		};

		auto ccrBitTest = [&](const CCRBit _bit)
		{
			const auto mask = static_cast<CCRMask>(1 << _bit);
			m_ccrRead |= mask;
			updateDirtyCCR(mask);
			m_asm.bitTest(m_dspRegs.getSR(JitDspRegs::Read).r32(), _bit);
		};

		switch (cccc)
		{
		case CCCC_CarrySet:											// CC(LO)		Carry Set	(lower)
			ccrBitTest(CCRB_C);
			return asmjit::x86::CondCode::kNotZero;
		case CCCC_CarryClear:										// CC(HS)		Carry Clear (higher or same)	
			ccrBitTest(CCRB_C);
			return asmjit::x86::CondCode::kZero;
		case CCCC_ExtensionSet:										// ES			Extension set	
			ccrBitTest(CCRB_E);
			return asmjit::x86::CondCode::kNotZero;
		case CCCC_ExtensionClear:									// EC			Extension clear	
			ccrBitTest(CCRB_E);
			return asmjit::x86::CondCode::kZero;
		case CCCC_Equal:											// EQ			Equal	
			ccrBitTest(CCRB_Z);
			return asmjit::x86::CondCode::kNotZero;
		case CCCC_NotEqual:											// NE			Not Equal
			ccrBitTest(CCRB_Z);
			return asmjit::x86::CondCode::kZero;
		case CCCC_LimitSet:											// LS			Limit set
			ccrBitTest(CCRB_L);
			return asmjit::x86::CondCode::kNotZero;
		case CCCC_LimitClear:										// LC			Limit clear
			ccrBitTest(CCRB_L);
			return asmjit::x86::CondCode::kZero;
		case CCCC_Minus:											// MI			Minus
			ccrBitTest(CCRB_N);
			return asmjit::x86::CondCode::kNotZero;
		case CCCC_Plus:												// PL			Plus
			ccrBitTest(CCRB_N);
			return asmjit::x86::CondCode::kZero;
		case CCCC_GreaterEqual:										// GE			Greater than or equal
			// SRB_N == SRB_V
			ccrMaskTest(static_cast<CCRMask>(CCR_N | CCR_V));
			return asmjit::x86::CondCode::kP;
		case CCCC_LessThan:											// LT			Less than
			// SRB_N != SRB_V
			ccrMaskTest(static_cast<CCRMask>(CCR_N | CCR_V));
			return asmjit::x86::CondCode::kNP;
		case CCCC_Normalized:										// NR			Normalized
			{
				// Z + (!U & !E) == 1
				ccrMaskTest(static_cast<CCRMask>(CCR_Z | CCR_U | CCR_E));
				return asmjit::x86::CondCode::kZero;
			}
		case CCCC_NotNormalized:									// NN			Not normalized
			{
				// Z + (!U & !E) == 0
				ccrMaskTest(static_cast<CCRMask>(CCR_Z | CCR_U | CCR_E));
				return asmjit::x86::CondCode::kNotZero;
			}
		case CCCC_GreaterThan:										// GT			Greater than
			{
				// (SRB_Z + (SRB_N != SRB_V)) == 0
				if(m_block.dsp().getAccuracyFixes())
				{
					zOrNXorVTest();
					return asmjit::x86::CondCode::kZero;
				}
				// legacy: the parity of Z, N and V, which is wrong when Z = 1 and N != V (two bits set: even)
				ccrMaskTest(static_cast<CCRMask>(CCR_Z | CCR_N | CCR_V));
				return asmjit::x86::CondCode::kParityEven;
			}
		case CCCC_LessEqual:										// LE			Less than or equal
			{
				// (SRB_Z + (SRB_N != SRB_V)) != 0
				if(m_block.dsp().getAccuracyFixes())
				{
					zOrNXorVTest();
					return asmjit::x86::CondCode::kNotZero;
				}
				// legacy: the parity of Z, N and V, which is wrong when Z = 1 and N != V
				ccrMaskTest(static_cast<CCRMask>(CCR_Z | CCR_N | CCR_V));
				return asmjit::x86::CondCode::kParityOdd;
			}
		default:
			assert(0 && "invalid CCCC value");
			return asmjit::x86::CondCode::kMaxValue;
		}
	}

	void JitOps::decode_cccc(const JitRegGP& _dst, const TWord cccc)
	{
		const auto cc = decode_cccc(cccc);
		m_asm.set(cc, _dst.r8());
	}
}

#endif