<?php

namespace Tests\Unit;

use App\Support\EventDay;
use Illuminate\Support\Carbon;
use PHPUnit\Framework\TestCase;

/** Day 1 is the 18th, Day 2 the 19th, in Philippine time. */
class EventDayTest extends TestCase
{
    public function test_the_18th_is_day_one_and_the_19th_day_two(): void
    {
        $this->assertSame('Day 1', EventDay::of(Carbon::parse('2026-10-18 14:00', 'Asia/Manila')));
        $this->assertSame('Day 2', EventDay::of(Carbon::parse('2026-10-19 10:00', 'Asia/Manila')));
        $this->assertNull(EventDay::of(Carbon::parse('2026-10-08 10:00', 'Asia/Manila')));
        $this->assertNull(EventDay::of(null));
    }

    public function test_the_day_is_counted_in_philippine_time(): void
    {
        // 18 Oct 17:30 UTC is already 19 Oct 01:30 in Manila.
        $this->assertSame('Day 2', EventDay::of(Carbon::parse('2026-10-18 17:30', 'UTC')));
        // 17 Oct 20:00 UTC is 18 Oct 04:00 in Manila.
        $this->assertSame('Day 1', EventDay::of(Carbon::parse('2026-10-17 20:00', 'UTC')));
    }
}
