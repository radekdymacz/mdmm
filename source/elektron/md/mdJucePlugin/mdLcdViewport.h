#pragma once

#include <algorithm>
#include <cmath>
#include <optional>

namespace mdJucePlugin::lcdInteraction
{
	struct Point
	{
		double x = 0;
		double y = 0;
	};

	struct Rect
	{
		double x = 0;
		double y = 0;
		double width = 0;
		double height = 0;
	};

	// The canvas can render through a padded texture whose dimensions differ
	// from its on-screen box. Keep both spaces explicit and use the same content
	// rectangle for painting and pointer conversion.
	class Viewport
	{
	public:
		static Viewport create(double _displayWidth, double _displayHeight,
			double _paintWidth, double _paintHeight, bool _integerScale)
		{
			Viewport result;
			result.m_displayWidth = std::max(0.0, _displayWidth);
			result.m_displayHeight = std::max(0.0, _displayHeight);
			result.m_paintWidth = std::max(0.0, _paintWidth);
			result.m_paintHeight = std::max(0.0, _paintHeight);
			auto scale = std::min(result.m_paintWidth / 128.0,
				result.m_paintHeight / 64.0);
			if(_integerScale && scale >= 1.0)
				scale = std::floor(scale);
			result.m_content.width = 128.0 * scale;
			result.m_content.height = 64.0 * scale;
			result.m_content.x = (result.m_paintWidth - result.m_content.width) * 0.5;
			result.m_content.y = (result.m_paintHeight - result.m_content.height) * 0.5;
			return result;
		}

		const Rect& contentInPaintSpace() const { return m_content; }

		std::optional<Point> displayToNative(const double _x, const double _y) const
		{
			if(m_displayWidth <= 0 || m_displayHeight <= 0
				|| m_paintWidth <= 0 || m_paintHeight <= 0
				|| m_content.width <= 0 || m_content.height <= 0)
				return std::nullopt;
			const auto paintX = _x * m_paintWidth / m_displayWidth;
			const auto paintY = _y * m_paintHeight / m_displayHeight;
			if(paintX < m_content.x || paintX >= m_content.x + m_content.width
				|| paintY < m_content.y || paintY >= m_content.y + m_content.height)
				return std::nullopt;
			return Point{(paintX - m_content.x) * 128.0 / m_content.width,
				(paintY - m_content.y) * 64.0 / m_content.height};
		}

	private:
		double m_displayWidth = 0;
		double m_displayHeight = 0;
		double m_paintWidth = 0;
		double m_paintHeight = 0;
		Rect m_content;
	};
}
