<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('draw_events', function (Blueprint $table) {
            $table->id();
            $table->uuid('event_uuid')->unique();
            $table->foreignId('raffle_id')->constrained()->cascadeOnDelete();
            $table->foreignId('user_id')->nullable()->constrained()->nullOnDelete();
            $table->unsignedSmallInteger('sequence')->nullable();
            $table->string('ticket_number', 64)->nullable();
            $table->string('result', 32);
            $table->string('message')->nullable();
            $table->unsignedInteger('eligible_count')->default(0);
            $table->string('request_id', 64)->nullable();
            $table->string('ip_address', 45)->nullable();
            $table->json('context')->nullable();
            $table->timestamps();

            $table->index('raffle_id');
            $table->index(['raffle_id', 'sequence']);
            $table->index('request_id');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('draw_events');
    }
};
