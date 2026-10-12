<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Prize tiers: one raffle can give out several prizes, each to its own
     * number of winners — 10 × ₱5,000, then 5 × iPhone, then 1 × car — drawn
     * in order. Each tier can be limited to some tags or developers, and can
     * let earlier winners win again or leave them out.
     */
    public function up(): void
    {
        Schema::create('raffle_prizes', function (Blueprint $table) {
            $table->id();
            $table->foreignId('raffle_id')->constrained()->cascadeOnDelete();
            $table->unsignedSmallInteger('sort_order')->default(0);
            $table->unsignedSmallInteger('winners_count');
            $table->string('prize_name', 160);
            $table->string('prize_type', 16)->default('cash');
            $table->decimal('prize_value', 14, 2)->nullable();
            $table->string('prize_currency', 8)->nullable();
            // null: everyone. Otherwise {"type": "tag"|"developer", "values": [...]}.
            $table->json('draw_filter')->nullable();
            // Whether someone who already won in this raffle can win this prize too.
            $table->boolean('include_previous_winners')->default(false);
            $table->timestamps();

            $table->index(['raffle_id', 'sort_order']);
        });

        Schema::table('winners', function (Blueprint $table) {
            $table->foreignId('raffle_prize_id')->nullable()->after('raffle_id')->constrained()->nullOnDelete();
        });
    }

    public function down(): void
    {
        Schema::table('winners', function (Blueprint $table) {
            $table->dropConstrainedForeignId('raffle_prize_id');
        });

        Schema::dropIfExists('raffle_prizes');
    }
};
