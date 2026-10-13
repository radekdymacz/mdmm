#pragma once

#include "elektronData/json.h"

#include <algorithm>
#include <optional>
#include <string>
#include <vector>

namespace deskCore
{
	// A solo is the page's idea (the machine has mutes only): the page mutes every other track on the machine and keeps
	// which tracks are soloed and the mutes the person had before (they come back when the last solo is let go). The
	// machine's own mutes travel with the machine's state in a project; this travels with the editor's setup, so a
	// reopened project shows the solo and the person's mutes again. Shared by both editors; a value, nothing more.
	struct SoloMemo
	{
		std::vector<int> tracks;	// soloed tracks, ascending
		std::vector<int> mutes;		// the person's mutes while a solo holds, ascending (none while no track is soloed)

		bool empty() const { return tracks.empty(); }
		bool operator==(const SoloMemo& _o) const { return tracks == _o.tracks && mutes == _o.mutes; }
		bool operator!=(const SoloMemo& _o) const { return !(*this == _o); }
	};

	namespace solo
	{
		namespace json = elektronData::json;

		// {"tracks":[...], "mutes":[...]}
		inline json::Value toJson(const SoloMemo& _s)
		{
			json::Value tracks = json::Value::array(), mutes = json::Value::array();
			for(const auto t : _s.tracks)
				tracks.push(t);
			for(const auto t : _s.mutes)
				mutes.push(t);
			json::Value v = json::Value::object();
			v.set("tracks", std::move(tracks));
			v.set("mutes", std::move(mutes));
			return v;
		}

		// A list of tracks 0 to _count - 1, each once; sorted. Errors carry the path.
		inline std::optional<std::vector<int>> listFrom(const json::Value* _v, const int _count, const std::string& _path, std::vector<std::string>& _errors)
		{
			std::vector<int> out;
			if(!_v)
				return out;
			if(!_v->isArray())
			{
				_errors.push_back(_path + ": expected a list of tracks");
				return {};
			}
			for(const auto& e : _v->asArray())
			{
				const int t = e.isNumber() ? static_cast<int>(e.asNumber()) : -1;
				if(!e.isNumber() || e.asNumber() != t || t < 0 || t >= _count)
				{
					_errors.push_back(_path + ": expected tracks 0 to " + std::to_string(_count - 1));
					return {};
				}
				if(std::find(out.begin(), out.end(), t) != out.end())
				{
					_errors.push_back(_path + ": track " + std::to_string(t) + " is listed twice");
					return {};
				}
				out.push_back(t);
			}
			std::sort(out.begin(), out.end());
			return out;
		}

		// The setup document's "solo" member (or a command's tracks and mutes): none given is no solo. The person's
		// mutes mean something only while a solo holds, so they are dropped with it.
		inline std::optional<SoloMemo> fromJson(const json::Value* _tracks, const json::Value* _mutes, const int _count, std::vector<std::string>& _errors,
			const std::string& _path = "$.solo")
		{
			const auto tracks = listFrom(_tracks, _count, _path + ".tracks", _errors);
			const auto mutes = listFrom(_mutes, _count, _path + ".mutes", _errors);
			if(!tracks || !mutes)
				return {};
			SoloMemo s;
			s.tracks = *tracks;
			if(!s.tracks.empty())
				s.mutes = *mutes;
			return s;
		}

		inline std::optional<SoloMemo> fromJson(const json::Value& _doc, const int _count, std::vector<std::string>& _errors, const std::string& _path = "$.solo")
		{
			if(!_doc.isObject())
			{
				_errors.push_back(_path + ": expected an object");
				return {};
			}
			return fromJson(_doc.find("tracks"), _doc.find("mutes"), _count, _errors, _path);
		}

		// The message the page takes: {"type":"solo","tracks":[...],"mutes":[...]}
		inline json::Value message(const SoloMemo& _s)
		{
			auto v = toJson(_s);
			v.set("type", "solo");
			return v;
		}
	}
}
